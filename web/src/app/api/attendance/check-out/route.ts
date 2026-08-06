import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";

import { isPhoneAttendanceRequest } from "@/lib/attendance-device";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api-errors";
import { getEffectiveShiftNameForDate } from "@/lib/shift-swap-schema";
import {
  findActiveLeaveForDate,
  formatJakartaDate,
  getLeaveTypeLabel,
} from "@/lib/leave-attendance-guard";
import { getNearestLocationLabel } from "@/lib/location-label";
import {
  findNearestValidOffice,
  getDistanceInMeters,
  getEffectiveGeofenceRadius,
  isGpsAccuracyAllowed,
  isValidGeofence,
  isValidGpsCoordinate,
  type OfficeGeofence,
} from "@/lib/geo";

export const runtime = "nodejs";

const MAX_GPS_ACCURACY_METERS = 1000;
const MAX_PHOTO_SIZE = 4 * 1024 * 1024;

const ALLOWED_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

type WorkMode = "office" | "wfh" | "visit";

type ParsedAttendanceBody = {
  photoBuffer: Uint8Array<ArrayBuffer> | null;
  photoMime: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  checkOutWorkMode: WorkMode | null;
  visitTitle: string;
  visitClientName: string;
  visitAddress: string;
  visitNote: string;
  earlyLeaveReason: string;
};

type StoredAttendancePhoto =
  {
    data: Uint8Array<ArrayBuffer>;
    secureUrl: null;
    publicId: null;
  };

async function getUserIdFromRequest(req: NextRequest) {
  const authUser = await requireAuth(req);

  return authUser.id;
}

function getTodayDateOnly() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);

  return new Date(
    Date.UTC(getPart("year"), getPart("month") - 1, getPart("day")),
  );
}

function toJakartaDate(date = new Date()) {
  return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

function getDayOfWeekEnum(date = new Date()) {
  const dayIndex = toJakartaDate(date).getDay();

  const days = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];

  return days[dayIndex];
}

function timeToMinutes(time: string) {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText || 0);
  const minute = Number(minuteText || 0);

  return hour * 60 + minute;
}

function dateToMinutes(date: Date) {
  const jakartaDate = toJakartaDate(date);

  return jakartaDate.getHours() * 60 + jakartaDate.getMinutes();
}

function normalizeScheduleTime(value: unknown) {
  if (!value) return "";

  if (typeof value === "string") {
    if (/^\d{2}:\d{2}/.test(value)) {
      return value.slice(0, 5);
    }

    const parsedDate = new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(parsedDate)
        .replace(".", ":");
    }

    return "";
  }

  if (value instanceof Date) {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(value)
      .replace(".", ":");
  }

  return "";
}

function getShiftDefaultCheckOutTime(shiftName?: string | null) {
  const name = String(shiftName || "").toUpperCase();

  if (name.includes("SHIFT SIANG")) return "21:00";
  if (name.includes("SIANG")) return "21:00";

  if (name.includes("SHIFT PAGI")) return "15:30";
  if (name.includes("PAGI")) return "15:30";

  if (name.includes("MAGANG")) return "17:00";
  if (name.includes("UTAMA")) return "17:00";

  return "17:00";
}

function calculateEarlyLeaveMinutes(
  checkOutAt: Date,
  scheduledCheckOut: string,
) {
  const checkOutMinutes = dateToMinutes(checkOutAt);
  const scheduledMinutes = timeToMinutes(scheduledCheckOut);
  const early = scheduledMinutes - checkOutMinutes;

  return early > 0 ? early : 0;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeWorkMode(value: unknown): WorkMode {
  const mode = String(value || "office")
    .trim()
    .toLowerCase();

  if (mode === "wfh") return "wfh";
  if (mode === "visit" || mode === "kunjungan") return "visit";
  if (mode === "office" || mode === "wfo" || mode === "kantor") {
    return "office";
  }

  return "office";
}

function getWorkModeLabel(workMode: WorkMode) {
  if (workMode === "wfh") return "WFH";
  if (workMode === "visit") return "Kunjungan";
  return "Kantor";
}

function getText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getFormText(formData: FormData, names: string[]) {
  for (const name of names) {
    const value = formData.get(name);

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function normalizeOptionalWorkMode(value: unknown) {
  const raw = String(value || "").trim();

  if (!raw) return null;

  return normalizeWorkMode(raw);
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);

  if (!match) {
    return {
      buffer: Uint8Array.from(Buffer.from(dataUrl, "base64")),
      mime: "image/jpeg",
    };
  }

  return {
    buffer: Uint8Array.from(Buffer.from(match[2], "base64")),
    mime: match[1],
  };
}

async function fileToBuffer(file: File) {
  const arrayBuffer = await file.arrayBuffer();

  return {
    buffer: new Uint8Array(arrayBuffer),
    mime: file.type || "image/jpeg",
  };
}

async function storeCheckOutPhoto(
  photoBuffer: Uint8Array<ArrayBuffer>,
): Promise<StoredAttendancePhoto> {
  return {
    data: photoBuffer,
    secureUrl: null,
    publicId: null,
  };
}

async function parseAttendanceBody(
  req: NextRequest,
): Promise<ParsedAttendanceBody> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();

    const photo =
      formData.get("photo") ||
      formData.get("photoDataUrl") ||
      formData.get("checkOutPhoto") ||
      formData.get("image");

    const latitude = toNumber(
      formData.get("latitude") ?? formData.get("checkOutLatitude"),
    );

    const longitude = toNumber(
      formData.get("longitude") ?? formData.get("checkOutLongitude"),
    );

    const accuracy = toNumber(
      formData.get("accuracy") ?? formData.get("checkOutAccuracy"),
    );
    const checkOutWorkMode = normalizeOptionalWorkMode(
      formData.get("checkOutWorkMode") ??
        formData.get("check_out_work_mode") ??
        formData.get("checkoutWorkMode") ??
        formData.get("workMode") ??
        formData.get("work_mode"),
    );
    const visitTitle = getFormText(formData, [
      "checkOutVisitTitle",
      "checkOutVisitPlaceName",
      "visitTitle",
      "visitPlaceName",
    ]);
    const visitClientName = getFormText(formData, [
      "checkOutVisitClientName",
      "visitClientName",
    ]);
    const visitAddress = getFormText(formData, [
      "checkOutVisitAddress",
      "visitAddress",
    ]);
    const visitNote = getFormText(formData, [
      "checkOutVisitNote",
      "checkOutVisitPurpose",
      "visitNote",
      "visitPurpose",
    ]);
    const earlyLeaveReason = getFormText(formData, [
      "earlyLeaveReason",
      "early_leave_reason",
      "checkOutReason",
      "checkoutReason",
      "reason",
    ]);

    if (photo instanceof File) {
      const result = await fileToBuffer(photo);

      return {
        photoBuffer: result.buffer,
        photoMime: result.mime,
        latitude,
        longitude,
        accuracy,
        checkOutWorkMode,
        visitTitle,
        visitClientName,
        visitAddress,
        visitNote,
        earlyLeaveReason,
      };
    }

    if (typeof photo === "string") {
      const result = dataUrlToBuffer(photo);

      return {
        photoBuffer: result.buffer,
        photoMime: result.mime,
        latitude,
        longitude,
        accuracy,
        checkOutWorkMode,
        visitTitle,
        visitClientName,
        visitAddress,
        visitNote,
        earlyLeaveReason,
      };
    }

    return {
      photoBuffer: null,
      photoMime: "image/jpeg",
      latitude,
      longitude,
      accuracy,
      checkOutWorkMode,
      visitTitle,
      visitClientName,
      visitAddress,
      visitNote,
      earlyLeaveReason,
    };
  }

  const body = (await req.json()) as Record<string, unknown>;
  const location =
    typeof body.location === "object" && body.location !== null
      ? (body.location as Record<string, unknown>)
      : {};

  const photoDataUrl =
    typeof body.photo === "string"
      ? body.photo
      : typeof body.photoDataUrl === "string"
        ? body.photoDataUrl
        : typeof body.checkOutPhoto === "string"
          ? body.checkOutPhoto
          : typeof body.image === "string"
            ? body.image
            : null;

  const latitude = toNumber(
    body.latitude ?? body.checkOutLatitude ?? location.latitude,
  );

  const longitude = toNumber(
    body.longitude ?? body.checkOutLongitude ?? location.longitude,
  );

  const accuracy = toNumber(
    body.accuracy ?? body.checkOutAccuracy ?? location.accuracy,
  );
  const checkOutWorkMode = normalizeOptionalWorkMode(
    body.checkOutWorkMode ??
      body.check_out_work_mode ??
      body.checkoutWorkMode ??
      body.workMode ??
      body.work_mode,
  );
  const visitTitle = getText(
    body.checkOutVisitTitle ??
      body.checkOutVisitPlaceName ??
      body.visitTitle ??
      body.visitPlaceName,
  );
  const visitClientName = getText(
    body.checkOutVisitClientName ?? body.visitClientName,
  );
  const visitAddress = getText(body.checkOutVisitAddress ?? body.visitAddress);
  const visitNote = getText(
    body.checkOutVisitNote ??
      body.checkOutVisitPurpose ??
      body.visitNote ??
      body.visitPurpose,
  );
  const earlyLeaveReason = getText(
    body.earlyLeaveReason ??
      body.early_leave_reason ??
      body.checkOutReason ??
      body.checkoutReason ??
      body.reason,
  );

  if (!photoDataUrl) {
    return {
      photoBuffer: null,
      photoMime: "image/jpeg",
      latitude,
      longitude,
      accuracy,
      checkOutWorkMode,
      visitTitle,
      visitClientName,
      visitAddress,
      visitNote,
      earlyLeaveReason,
    };
  }

  const result = dataUrlToBuffer(photoDataUrl);

  return {
    photoBuffer: result.buffer,
    photoMime: result.mime,
    latitude,
    longitude,
    accuracy,
    checkOutWorkMode,
    visitTitle,
    visitClientName,
    visitAddress,
    visitNote,
    earlyLeaveReason,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!isPhoneAttendanceRequest(req)) {
      return NextResponse.json(
        {
          error:
            "Presensi hanya bisa dilakukan melalui handphone. Silakan buka Presensi dari browser HP.",
        },
        { status: 403 },
      );
    }

    const userId = await getUserIdFromRequest(req);

    const {
      photoBuffer,
      photoMime,
      latitude,
      longitude,
      accuracy,
      checkOutWorkMode,
      visitTitle,
      visitClientName,
      visitAddress,
      visitNote,
      earlyLeaveReason,
    } = await parseAttendanceBody(req);

    if (!photoBuffer) {
      return NextResponse.json(
        { error: "Foto check-out wajib dikirim." },
        { status: 400 },
      );
    }

    if (!ALLOWED_PHOTO_MIME_TYPES.has(photoMime.toLowerCase())) {
      return NextResponse.json(
        { error: "Format foto harus JPG, PNG, atau WEBP." },
        { status: 400 },
      );
    }

    if (photoBuffer.byteLength > MAX_PHOTO_SIZE) {
      return NextResponse.json(
        { error: "Ukuran foto maksimal 4MB." },
        { status: 400 },
      );
    }

    if (latitude === null || longitude === null) {
      return NextResponse.json(
        { error: "Lokasi GPS check-out wajib dikirim." },
        { status: 400 },
      );
    }

    if (accuracy === null) {
      return NextResponse.json(
        { error: "Akurasi GPS check-out wajib dikirim." },
        { status: 400 },
      );
    }

    if (!isValidGpsCoordinate({ lat: latitude, lng: longitude })) {
      return NextResponse.json(
        { error: "Koordinat GPS check-out tidak valid." },
        { status: 400 },
      );
    }

    if (!isGpsAccuracyAllowed(accuracy, MAX_GPS_ACCURACY_METERS)) {
      return NextResponse.json(
        {
          error: `Akurasi GPS terlalu rendah. Maksimal ±${MAX_GPS_ACCURACY_METERS} meter.`,
          accuracy,
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        registered_office_id: true,
        shift: {
          select: {
            id: true,
            name: true,
            start_time: true,
            end_time: true,
            check_in_open: true,
            check_out_open: true,
            work_schedules: {
              select: {
                id: true,
                day_of_week: true,
                is_work_day: true,
                check_out_time: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Data user tidak ditemukan." },
        { status: 404 },
      );
    }

    if (user.status !== "active") {
      return NextResponse.json(
        { error: "Akun kamu sedang tidak aktif." },
        { status: 403 },
      );
    }

    const now = new Date();
    const today = getTodayDateOnly();

    const activeLeave = await findActiveLeaveForDate({
      userId,
      date: today,
    });

    if (activeLeave) {
      const leaveLabel = getLeaveTypeLabel(activeLeave.leave_type);

      return NextResponse.json(
        {
          success: false,
          error: `Kamu sedang dalam periode ${leaveLabel} pada ${formatJakartaDate(
            today,
          )}. Check-in dan check-out tidak dapat dilakukan selama cuti/sakit/izin.`,
          message: `Kamu sedang dalam periode ${leaveLabel} pada ${formatJakartaDate(
            today,
          )}. Check-in dan check-out tidak dapat dilakukan selama cuti/sakit/izin.`,
          leaveBlock: {
            id: activeLeave.id,
            leaveType: activeLeave.leave_type,
            status: activeLeave.status,
          },
        },
        { status: 400 },
      );
    }

    const attendance = await prisma.attendance.findFirst({
      where: {
        user_id: userId,
        attendance_date: today,
      },
    });

    if (!attendance || !attendance.check_in_time) {
      return NextResponse.json(
        { error: "Kamu belum melakukan check-in hari ini." },
        { status: 400 },
      );
    }

    if (attendance.check_out_time) {
      return NextResponse.json(
        { error: "Kamu sudah melakukan check-out hari ini." },
        { status: 400 },
      );
    }

    const checkInWorkMode = normalizeWorkMode(attendance.work_mode);
    const requestedCheckOutMode = checkOutWorkMode || checkInWorkMode;
    let workMode: WorkMode;

    if (checkInWorkMode === "wfh") {
      workMode = "wfh";
    } else if (requestedCheckOutMode === "wfh") {
      return NextResponse.json(
        {
          error:
            "Mode check-out tidak sesuai. WFH hanya bisa digunakan jika check-in WFH.",
        },
        { status: 400 },
      );
    } else {
      workMode = requestedCheckOutMode;
    }

    const isOfficeMode = workMode === "office";
    const isWfhMode = workMode === "wfh";
    const isVisitMode = workMode === "visit";
    const isFlexibleMode = isWfhMode || isVisitMode;
    const isCheckOutVisitDataRequired =
      isVisitMode && checkInWorkMode !== "visit";

    if (
      isCheckOutVisitDataRequired &&
      (!visitTitle || !visitAddress || !visitNote)
    ) {
      return NextResponse.json(
        {
          error:
            "Data kunjungan wajib diisi saat check-out dengan mode Kunjungan.",
        },
        { status: 400 },
      );
    }

    let matchedOffice: {
      office: OfficeGeofence;
      distance: number;
      effectiveRadius: number;
      isWithinRadius: boolean;
    } | null = null;

    if (isOfficeMode) {
      const officeId =
        attendance.registered_office_id || user.registered_office_id;

      if (!officeId) {
        return NextResponse.json(
          {
            success: false,
            error: "Akun kamu belum memiliki kantor terdaftar.",
            message:
              "Hubungi admin untuk mengatur kantor karyawan terlebih dahulu.",
          },
          { status: 400 },
        );
      }

      const activeOffices = await prisma.officeLocation.findMany({
        where: { status: "active" },
        orderBy: [{ id: officeId ? "asc" : "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          radius_meters: true,
        },
      });
      const registeredOffice = activeOffices.find(
        (office) => office.id === officeId,
      );

      if (!registeredOffice) {
        return NextResponse.json(
          {
            success: false,
            error: "Kantor terdaftar tidak ditemukan atau sedang tidak aktif.",
            message:
              "Hubungi admin untuk memastikan kantor karyawan masih aktif.",
          },
          { status: 400 },
        );
      }

      const officeGeofences = activeOffices
        .map((office) => {
          const officeLatitude = toNumber(office.latitude);
          const officeLongitude = toNumber(office.longitude);
          const officeRadius = toNumber(office.radius_meters);

          if (
            officeLatitude === null ||
            officeLongitude === null ||
            officeRadius === null
          ) {
            return null;
          }

          return {
            id: office.id,
            name: office.name,
            latitude: officeLatitude,
            longitude: officeLongitude,
            radius_meters: officeRadius,
          };
        })
        .filter((office): office is OfficeGeofence => office !== null);

      const registeredOfficeGeofence = officeGeofences.find(
        (office) => office.id === registeredOffice.id,
      );

      if (!registeredOfficeGeofence) {
        return NextResponse.json(
          {
            success: false,
            error: "Data titik GPS kantor belum lengkap.",
            message:
              "Latitude, longitude, atau radius kantor belum lengkap di master data kantor.",
          },
          { status: 400 },
        );
      }

      if (!isValidGeofence(registeredOfficeGeofence)) {
        return NextResponse.json(
          {
            success: false,
            error: "Data geofence kantor tidak valid.",
            message:
              "Latitude harus -90 sampai 90, longitude -180 sampai 180, dan radius kantor harus lebih dari 0 meter.",
          },
          { status: 400 },
        );
      }

      const sortedOfficeGeofences = [
        registeredOfficeGeofence,
        ...officeGeofences.filter(
          (office) => office.id !== registeredOffice.id,
        ),
      ];

      matchedOffice = findNearestValidOffice(
        { lat: latitude, lng: longitude },
        sortedOfficeGeofences,
        accuracy,
      );

      if (!matchedOffice) {
        const nearestOffice = sortedOfficeGeofences
          .filter(isValidGeofence)
          .map((office) => {
            const distance = getDistanceInMeters(
              { lat: latitude, lng: longitude },
              { lat: office.latitude, lng: office.longitude },
            );
            const effectiveRadius = getEffectiveGeofenceRadius(
              office.radius_meters,
              accuracy,
            );

            return { office, distance, effectiveRadius };
          })
          .sort((a, b) => a.distance - b.distance)[0];

        return NextResponse.json(
          {
            success: false,
            error: `Lokasi kamu berada di luar radius kantor ${registeredOffice.name}.`,
            message: nearestOffice
              ? `Kamu hanya bisa check-out mode Kantor di radius kantor aktif. Kantor terdekat: ${nearestOffice.office.name}. Jarak terdeteksi ${Math.round(
                  nearestOffice.distance,
                )} meter, batas efektif ${Math.round(
                  nearestOffice.effectiveRadius,
                )} meter termasuk toleransi akurasi GPS. Jika kamu memang di kantor, periksa titik latitude/longitude kantor di menu Admin > Kantor.`
              : "Tidak ada data titik kantor aktif yang valid. Hubungi admin untuk memperbaiki master data kantor.",
            latitude,
            longitude,
            accuracy,
            distance: nearestOffice ? Math.round(nearestOffice.distance) : null,
            radius: nearestOffice?.office.radius_meters ?? null,
            effectiveRadius: nearestOffice
              ? Math.round(nearestOffice.effectiveRadius)
              : null,
            office: nearestOffice
              ? {
                  id: nearestOffice.office.id,
                  name: nearestOffice.office.name,
                  latitude: nearestOffice.office.latitude,
                  longitude: nearestOffice.office.longitude,
                  radius: nearestOffice.office.radius_meters,
                }
              : null,
          },
          { status: 400 },
        );
      }
    }

    const todayName = getDayOfWeekEnum(now);
    const effectiveShiftName = await getEffectiveShiftNameForDate(
      userId,
      today,
      user.shift?.name,
    );
    const effectiveShift =
      effectiveShiftName && effectiveShiftName !== user.shift?.name
        ? await prisma.shift.findFirst({
            where: { name: effectiveShiftName },
            select: {
              id: true,
              name: true,
              start_time: true,
              end_time: true,
              check_in_open: true,
              check_out_open: true,
              work_schedules: {
                select: {
                  id: true,
                  day_of_week: true,
                  is_work_day: true,
                  check_out_time: true,
                },
              },
            },
          })
        : user.shift;

    const todaySchedule = effectiveShift?.work_schedules?.find((schedule) => {
      return String(schedule.day_of_week).toUpperCase() === todayName;
    });

    if (todaySchedule && todaySchedule.is_work_day === false) {
      return NextResponse.json(
        { error: "Hari ini bukan jadwal kerja kamu." },
        { status: 400 },
      );
    }

    const scheduledCheckOutTime =
      normalizeScheduleTime(todaySchedule?.check_out_time) ||
      effectiveShift?.end_time ||
      getShiftDefaultCheckOutTime(effectiveShiftName);

    const diffMs = now.getTime() - attendance.check_in_time.getTime();
    const workMinutes = diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;

    const earlyLeaveMinutes = calculateEarlyLeaveMinutes(
      now,
      scheduledCheckOutTime,
    );

    if (earlyLeaveMinutes > 0 && !earlyLeaveReason) {
      return NextResponse.json(
        {
          success: false,
          requiresEarlyLeaveReason: true,
          error:
            "Checkout lebih awal membutuhkan alasan. Silakan isi alasan pulang cepat.",
          message:
            "Checkout lebih awal membutuhkan alasan. Silakan isi alasan pulang cepat.",
        },
        { status: 400 },
      );
    }

    const checkOutStatus =
      earlyLeaveMinutes > 0 ? ("EARLY" as const) : ("NORMAL" as const);

    const storedPhoto = await storeCheckOutPhoto(photoBuffer);

    let updatedAttendance;

    try {
      const nearestLocationLabel = isFlexibleMode
        ? await getNearestLocationLabel(latitude, longitude)
        : "";

      updatedAttendance = await prisma.$transaction(async (tx) => {
        const savedAttendance = await tx.attendance.update({
          where: {
            id: attendance.id,
          },
          data: {
            check_out_time: now,
            check_out_photo: storedPhoto.data,
            check_out_photo_mime: photoMime,
            check_out_photo_url: storedPhoto.secureUrl,
            check_out_photo_public_id: storedPhoto.publicId,

            check_out_latitude: latitude,
            check_out_longitude: longitude,
            check_out_accuracy: accuracy,
            check_out_distance: matchedOffice?.distance ?? null,
            check_out_within_radius: Boolean(matchedOffice?.isWithinRadius),
            check_out_office_id: matchedOffice?.office.id ?? null,

            registered_office_id:
              attendance.registered_office_id ?? user.registered_office_id,

            work_minutes: workMinutes,
            early_leave_minutes: earlyLeaveMinutes,
            early_leave_reason: earlyLeaveReason || null,
            check_out_status: checkOutStatus,
            activity_note: isFlexibleMode
              ? `Check-out: ${getWorkModeLabel(workMode)}`
              : attendance.activity_note,
          },
        });

        await tx.$executeRawUnsafe(
          "UPDATE `Attendance` SET `check_out_work_mode` = ? WHERE `id` = ?",
          workMode,
          attendance.id,
        );

        if (isVisitMode) {
          const isCompletingCheckInVisit = checkInWorkMode === "visit";
          const updatedVisit = await tx.employeeVisit.updateMany({
            where: {
              attendance_id: attendance.id,
              user_id: userId,
              status: {
                not: "cancelled",
              },
            },
            data: isCompletingCheckInVisit
              ? {
                  end_time: now,
                  status: "completed",
                }
              : {
                  title: visitTitle,
                  client_name: visitClientName || null,
                  address: visitAddress,
                  latitude,
                  longitude,
                  accuracy,
                  start_time: now,
                  end_time: now,
                  note: visitNote,
                  status: "completed",
                },
          });

          if (updatedVisit.count === 0) {
            await tx.employeeVisit.create({
              data: {
                user_id: userId,
                attendance_id: savedAttendance.id,
                visit_date: today,
                title: visitTitle || "Kunjungan",
                client_name: visitClientName || null,
                address: visitAddress || nearestLocationLabel,
                latitude,
                longitude,
                accuracy,
                start_time: now,
                end_time: now,
                note: visitNote || "Check-out kunjungan",
                status: "completed",
              },
            });
          }
        }

        if (isFlexibleMode) {
          const modeLabel = getWorkModeLabel(workMode);
          const employeeName = user.name || "Karyawan";

          await tx.adminNotification.create({
            data: {
              attendance_id: savedAttendance.id,
              user_id: userId,
              type: workMode,
              title:
                workMode === "visit"
                  ? "Karyawan selesai kunjungan"
                  : `Karyawan selesai ${modeLabel}`,
              message:
                workMode === "visit"
                  ? `${employeeName} melakukan check-out kunjungan di ${visitAddress || nearestLocationLabel}.`
                  : `${employeeName} melakukan check-out mode ${modeLabel}. Lokasi: ${nearestLocationLabel}.`,
              status: "unread",
              is_read: false,
            },
          });
        }

        return savedAttendance;
      });
    } catch (databaseError) {
      throw databaseError;
    }

    return NextResponse.json({
      success: true,
      message:
        earlyLeaveMinutes > 0
          ? `Check-out berhasil. Kamu pulang lebih awal ${earlyLeaveMinutes} menit.`
          : "Check-out berhasil.",
      attendanceId: updatedAttendance.id,
      photoUrl: storedPhoto.secureUrl,
      workMode,
      workModeLabel: getWorkModeLabel(workMode),
      isWfh: isWfhMode,
      isWfc: false,
      isVisit: isVisitMode,
      office: matchedOffice
        ? {
            id: matchedOffice.office.id,
            name: matchedOffice.office.name,
            distance: Math.round(matchedOffice.distance),
            radius: matchedOffice.office.radius_meters,
          }
        : null,
      gps: {
        latitude,
        longitude,
        accuracy: Math.round(accuracy),
      },
      schedule: {
        shift: effectiveShiftName || user.shift?.name || "Tanpa Shift",
        scheduledCheckOutTime,
      },
      workMinutes,
      earlyLeaveMinutes,
      checkOutStatus,
    });
  } catch (error) {
    console.error("CHECK_OUT_ERROR:", error);

    return NextResponse.json(
      { error: getApiErrorMessage(error, "Gagal melakukan check-out.") },
      { status: getApiErrorStatus(error) },
    );
  }
}
