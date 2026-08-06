import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";

import { isPhoneAttendanceRequest } from "@/lib/attendance-device";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api-errors";
import {
  ensureWfhQuotaColumn,
  isMissingWfhQuotaColumnError,
} from "@/lib/wfh-quota-schema";
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
  lateReason: string;
  workMode: WorkMode;
  activityNote: string;
  visitTitle: string;
  visitClientName: string;
  visitAddress: string;
  visitNote: string;
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

function getJakartaMonthRange(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  const year = getPart("year");
  const month = getPart("month");

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
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
  return Number(hourText || 0) * 60 + Number(minuteText || 0);
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

function dateToMinutes(date: Date) {
  const jakartaDate = toJakartaDate(date);
  return jakartaDate.getHours() * 60 + jakartaDate.getMinutes();
}

function calculateLateMinutes(
  checkInAt: Date,
  startTime: string,
  toleranceMinutes: number,
) {
  const late =
    dateToMinutes(checkInAt) - timeToMinutes(startTime) - toleranceMinutes;

  return late > 0 ? late : 0;
}

function getShiftStartTime(shiftName?: string | null) {
  const name = String(shiftName || "").toUpperCase();

  if (name.includes("SHIFT SIANG") || name.includes("SIANG")) return "13:00";
  if (name.includes("SHIFT PAGI") || name.includes("PAGI")) return "07:30";
  if (name.includes("MAGANG") || name.includes("UTAMA")) return "08:00";

  return "08:00";
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

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

async function storeCheckInPhoto(
  photoBuffer: Uint8Array<ArrayBuffer>,
): Promise<StoredAttendancePhoto> {
  return {
    data: photoBuffer,
    secureUrl: null,
    publicId: null,
  };
}

function getFormText(formData: FormData, keys: string[]) {
  for (const key of keys) {
    const value = formData.get(key);

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getBodyText(body: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = body[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
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
      formData.get("checkInPhoto") ||
      formData.get("image");

    const latitude = toNumber(
      formData.get("latitude") ?? formData.get("checkInLatitude"),
    );

    const longitude = toNumber(
      formData.get("longitude") ?? formData.get("checkInLongitude"),
    );

    const accuracy = toNumber(
      formData.get("accuracy") ?? formData.get("checkInAccuracy"),
    );

    const lateReason = getFormText(formData, [
      "lateReason",
      "late_reason",
      "reason",
      "lateNote",
      "late_note",
    ]);

    const workMode = normalizeWorkMode(
      formData.get("workMode") ||
        formData.get("work_mode") ||
        formData.get("attendanceMode") ||
        formData.get("attendance_mode"),
    );

    const activityNote = getFormText(formData, [
      "activityNote",
      "activity_note",
      "note",
    ]);

    const visitTitle = getFormText(formData, [
      "visitTitle",
      "visit_title",
      "visitPlaceName",
      "visit_place_name",
      "placeName",
      "place_name",
      "title",
    ]);

    const visitClientName = getFormText(formData, [
      "visitClientName",
      "visit_client_name",
      "clientName",
      "client_name",
    ]);

    const visitAddress = getFormText(formData, [
      "visitAddress",
      "visit_address",
      "address",
    ]);

    const visitNote = getFormText(formData, [
      "visitNote",
      "visit_note",
      "visitPurpose",
      "visit_purpose",
      "purpose",
    ]);

    const baseData = {
      latitude,
      longitude,
      accuracy,
      lateReason,
      workMode,
      activityNote,
      visitTitle,
      visitClientName,
      visitAddress,
      visitNote,
    };

    if (photo instanceof File) {
      const result = await fileToBuffer(photo);

      return {
        ...baseData,
        photoBuffer: result.buffer,
        photoMime: result.mime,
      };
    }

    if (typeof photo === "string") {
      const result = dataUrlToBuffer(photo);

      return {
        ...baseData,
        photoBuffer: result.buffer,
        photoMime: result.mime,
      };
    }

    return {
      ...baseData,
      photoBuffer: null,
      photoMime: "image/jpeg",
    };
  }

  const body = (await req.json()) as Record<string, unknown>;

  const photoDataUrl =
    typeof body.photo === "string"
      ? body.photo
      : typeof body.photoDataUrl === "string"
        ? body.photoDataUrl
        : typeof body.checkInPhoto === "string"
          ? body.checkInPhoto
          : typeof body.image === "string"
            ? body.image
            : null;

  const latitude = toNumber(
    body.latitude ??
      body.checkInLatitude ??
      (body.location as { latitude?: unknown } | undefined)?.latitude,
  );

  const longitude = toNumber(
    body.longitude ??
      body.checkInLongitude ??
      (body.location as { longitude?: unknown } | undefined)?.longitude,
  );

  const accuracy = toNumber(
    body.accuracy ??
      body.checkInAccuracy ??
      (body.location as { accuracy?: unknown } | undefined)?.accuracy,
  );

  const lateReason = getBodyText(body, [
    "lateReason",
    "late_reason",
    "reason",
    "lateNote",
    "late_note",
  ]);

  const workMode = normalizeWorkMode(
    body.workMode ??
      body.work_mode ??
      body.attendanceMode ??
      body.attendance_mode,
  );

  const activityNote = getBodyText(body, [
    "activityNote",
    "activity_note",
    "note",
  ]);

  const visitTitle = getBodyText(body, [
    "visitTitle",
    "visit_title",
    "visitPlaceName",
    "visit_place_name",
    "placeName",
    "place_name",
    "title",
  ]);

  const visitClientName = getBodyText(body, [
    "visitClientName",
    "visit_client_name",
    "clientName",
    "client_name",
  ]);

  const visitAddress = getBodyText(body, [
    "visitAddress",
    "visit_address",
    "address",
  ]);

  const visitNote = getBodyText(body, [
    "visitNote",
    "visit_note",
    "visitPurpose",
    "visit_purpose",
    "purpose",
  ]);

  const baseData = {
    latitude,
    longitude,
    accuracy,
    lateReason,
    workMode,
    activityNote,
    visitTitle,
    visitClientName,
    visitAddress,
    visitNote,
  };

  if (!photoDataUrl) {
    return {
      ...baseData,
      photoBuffer: null,
      photoMime: "image/jpeg",
    };
  }

  const result = dataUrlToBuffer(photoDataUrl);

  return {
    ...baseData,
    photoBuffer: result.buffer,
    photoMime: result.mime,
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
      lateReason,
      workMode,
      activityNote,
      visitTitle,
      visitClientName,
      visitAddress,
      visitNote,
    } = await parseAttendanceBody(req);
    const isOfficeMode = workMode === "office";
    const isWfhMode = workMode === "wfh";
    const isVisitMode = workMode === "visit";
    const isFlexibleMode = isWfhMode || isVisitMode;

    if (!photoBuffer) {
      return NextResponse.json(
        { error: "Foto check-in wajib dikirim." },
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
        { error: "Lokasi GPS check-in wajib dikirim." },
        { status: 400 },
      );
    }

    if (accuracy === null) {
      return NextResponse.json(
        { error: "Akurasi GPS check-in wajib dikirim." },
        { status: 400 },
      );
    }

    if (!isValidGpsCoordinate({ lat: latitude, lng: longitude })) {
      return NextResponse.json(
        { error: "Koordinat GPS check-in tidak valid." },
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

    if (isVisitMode && (!visitTitle || !visitAddress || !visitNote)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Data kunjungan wajib diisi. Isi nama/tempat kunjungan, alamat, dan keperluan kunjungan.",
          message:
            "Data kunjungan wajib diisi. Isi nama/tempat kunjungan, alamat, dan keperluan kunjungan.",
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
        employee_code: true,
        status: true,
        registered_office_id: true,
        shift: {
          select: {
            id: true,
            name: true,
            tolerance_minutes: true,
            start_time: true,
            end_time: true,
            check_in_open: true,
            check_out_open: true,
            work_schedules: {
              select: {
                day_of_week: true,
                is_work_day: true,
                check_in_time: true,
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
              tolerance_minutes: true,
              start_time: true,
              end_time: true,
              check_in_open: true,
              check_out_open: true,
              work_schedules: {
                select: {
                  day_of_week: true,
                  is_work_day: true,
                  check_in_time: true,
                },
              },
            },
          })
        : user.shift;
    const todaySchedule = effectiveShift?.work_schedules?.find((schedule) => {
      return String(schedule.day_of_week).toUpperCase() === todayName;
    });

    if (isWfhMode) {
      const hasWfhQuotaColumn = await ensureWfhQuotaColumn();
      let quotaRows: Array<{ wfh_quota_monthly: number | null }> = [];

      if (hasWfhQuotaColumn) {
        try {
          quotaRows = await prisma.$queryRawUnsafe<
            Array<{ wfh_quota_monthly: number | null }>
          >(
            "SELECT COALESCE(wfh_quota_monthly, 0) AS wfh_quota_monthly FROM users WHERE id = ? LIMIT 1",
            userId,
          );
        } catch (error) {
          if (!isMissingWfhQuotaColumnError(error)) throw error;
        }
      }
      const wfhQuotaMonthly = Math.max(
        0,
        Number(quotaRows[0]?.wfh_quota_monthly || 0),
      );
      const { start, end } = getJakartaMonthRange(now);
      const usedWfhThisMonth = await prisma.attendance.count({
        where: {
          user_id: userId,
          attendance_date: {
            gte: start,
            lt: end,
          },
          work_mode: "wfh",
          check_out_work_mode: "wfh",
          check_in_time: {
            not: null,
          },
          check_out_time: {
            not: null,
          },
        },
      });
      const remainingWfhQuota = Math.max(0, wfhQuotaMonthly - usedWfhThisMonth);

      if (wfhQuotaMonthly > 0 && remainingWfhQuota <= 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Kuota WFH bulan ini sudah habis. Silakan pilih mode Kantor atau hubungi admin.",
            message:
              "Kuota WFH bulan ini sudah habis. Silakan pilih mode Kantor atau hubungi admin.",
            wfhQuota: {
              quota: wfhQuotaMonthly,
              used: usedWfhThisMonth,
              remaining: 0,
            },
          },
          { status: 400 },
        );
      }

      // Max 2 Karyawan WFH per hari
      const MAX_DAILY_WFH = 2;
      const todayWfhCount = await prisma.attendance.count({
        where: {
          attendance_date: today,
          work_mode: "wfh",
          check_in_time: {
            not: null,
          },
          NOT: {
            user_id: userId,
          },
        },
      });

      if (todayWfhCount >= MAX_DAILY_WFH) {
        return NextResponse.json(
          {
            success: false,
            error: `Kuota WFH harian kantor sudah penuh (Maksimal ${MAX_DAILY_WFH} karyawan per hari). Silakan absensi mode Kantor atau Kunjungan.`,
            message: `Kuota WFH harian kantor sudah penuh (Maksimal ${MAX_DAILY_WFH} karyawan per hari). Silakan absensi mode Kantor atau Kunjungan.`,
          },
          { status: 400 },
        );
      }
    }

    let matchedOffice: {
      office: OfficeGeofence;
      distance: number;
      effectiveRadius: number;
      isWithinRadius: boolean;
    } | null = null;

    if (isOfficeMode) {
      if (!user.registered_office_id) {
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
        orderBy: [
          { id: user.registered_office_id ? "asc" : "desc" },
          { name: "asc" },
        ],
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          radius_meters: true,
        },
      });
      const registeredOffice = activeOffices.find(
        (office) => office.id === user.registered_office_id,
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
              ? `Kamu hanya bisa absen mode Kantor di radius kantor aktif. Kantor terdekat: ${nearestOffice.office.name}. Jarak terdeteksi ${Math.round(
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

    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        user_id: userId,
        attendance_date: today,
      },
    });

    if (existingAttendance?.check_in_time) {
      return NextResponse.json(
        { error: "Kamu sudah melakukan check-in hari ini." },
        { status: 400 },
      );
    }

    const shouldValidateLate = !isVisitMode;

    if (
      shouldValidateLate &&
      todaySchedule &&
      todaySchedule.is_work_day === false
    ) {
      return NextResponse.json(
        { error: "Hari ini bukan jadwal kerja kamu." },
        { status: 400 },
      );
    }
    const startTime = shouldValidateLate
      ? normalizeScheduleTime(todaySchedule?.check_in_time) ||
        effectiveShift?.start_time ||
        getShiftStartTime(effectiveShiftName)
      : null;

    const toleranceMinutes = shouldValidateLate
      ? Number(effectiveShift?.tolerance_minutes ?? user.shift?.tolerance_minutes ?? 5)
      : 0;

    const lateMinutes =
      shouldValidateLate && startTime
        ? calculateLateMinutes(now, startTime, toleranceMinutes)
        : 0;

    const isLate = shouldValidateLate && lateMinutes > 0;
    const attendanceStatus = isLate ? ("LATE" as const) : ("PRESENT" as const);

    if (isLate && !lateReason) {
      return NextResponse.json(
        {
          success: false,
          requiresLateReason: true,
          error:
            "Kamu sudah melewati batas toleransi. Alasan telat wajib diisi.",
          message:
            "Kamu sudah melewati batas toleransi. Alasan telat wajib diisi.",
          lateMinutes,
          schedule: {
            shift: effectiveShiftName || user.shift?.name || "Tanpa Shift",
            startTime,
            toleranceMinutes,
          },
        },
        { status: 400 },
      );
    }

    const storedPhoto = await storeCheckInPhoto(photoBuffer);

    const checkInData = {
      check_in_time: now,
      check_in_photo: storedPhoto.data,
      check_in_photo_mime: photoMime,
      check_in_photo_url: storedPhoto.secureUrl,
      check_in_photo_public_id: storedPhoto.publicId,

      work_mode: workMode,
      is_wfh: isWfhMode,
      is_wfc: false,
      is_visit: isVisitMode,

      check_in_latitude: latitude,
      check_in_longitude: longitude,
      check_in_accuracy: accuracy,
      check_in_distance: matchedOffice?.distance ?? null,
      check_in_within_radius: Boolean(matchedOffice?.isWithinRadius),

      registered_office_id: user.registered_office_id,
      check_in_office_id: matchedOffice?.office.id ?? null,

      status: attendanceStatus,
      check_in_status: isLate ? ("LATE" as const) : ("ON_TIME" as const),
      late_minutes: lateMinutes,
      is_over_tolerance: isLate,
      late_reason: isLate ? lateReason : null,

      activity_note: activityNote || null,
    };

    let attendance;

    try {
      const nearestLocationLabel = isFlexibleMode
        ? await getNearestLocationLabel(latitude, longitude)
        : "";

      attendance = await prisma.$transaction(async (tx) => {
        const savedAttendance = existingAttendance
          ? await tx.attendance.update({
              where: {
                id: existingAttendance.id,
              },
              data: {
                ...checkInData,
                work_minutes: existingAttendance.work_minutes ?? 0,
              },
            })
          : await tx.attendance.create({
              data: {
                user_id: userId,
                attendance_date: today,
                ...checkInData,
                work_minutes: 0,
              },
            });

        if (isVisitMode) {
          await tx.employeeVisit.create({
            data: {
              user_id: userId,
              attendance_id: savedAttendance.id,
              visit_date: today,
              title: visitTitle,
              client_name: visitClientName || null,
              address: visitAddress,
              latitude,
              longitude,
              accuracy,
              start_time: now,
              note: visitNote,
              status: "ongoing",
            },
          });
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
                  ? "Karyawan melakukan kunjungan"
                  : `Karyawan ${modeLabel}`,
              message:
                workMode === "visit"
                  ? `${employeeName} check-in kunjungan di ${visitTitle}. Alamat: ${visitAddress || nearestLocationLabel}. Keperluan: ${visitNote}.`
                  : `${employeeName} check-in dengan mode ${modeLabel}. Lokasi: ${nearestLocationLabel}.`,
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
      message: isVisitMode
        ? "Check-in kunjungan berhasil."
        : isLate
          ? `Check-in berhasil. Kamu terlambat ${lateMinutes} menit.`
          : "Check-in berhasil.",
      attendanceId: attendance.id,
      photoUrl: storedPhoto.secureUrl,
      status: attendanceStatus,
      workMode,
      workModeLabel: getWorkModeLabel(workMode),
      isWfh: isWfhMode,
      isWfc: false,
      isVisit: isVisitMode,
      lateMinutes,
      lateReason: isLate ? lateReason : null,
      isLateValidationSkipped: isVisitMode,
      schedule: shouldValidateLate
        ? {
            shift: effectiveShiftName || user.shift?.name || "Tanpa Shift",
            startTime,
            toleranceMinutes,
          }
        : {
            shift: effectiveShiftName || user.shift?.name || "Tanpa Shift",
            startTime: null,
            toleranceMinutes: 0,
            note: "Mode kunjungan tidak terikat jadwal shift dan toleransi keterlambatan.",
          },
      office: matchedOffice
        ? {
            id: matchedOffice.office.id,
            name: matchedOffice.office.name,
            distance: Math.round(matchedOffice.distance),
            radius: matchedOffice.office.radius_meters,
          }
        : null,
      visit: isVisitMode
        ? {
            title: visitTitle,
            clientName: visitClientName || null,
            address: visitAddress,
            note: visitNote,
          }
        : null,
      gps: {
        latitude,
        longitude,
        accuracy: Math.round(accuracy),
      },
    });
  } catch (error) {
    console.error("CHECK_IN_ERROR:", error);

    return NextResponse.json(
      { error: getApiErrorMessage(error, "Gagal melakukan check-in.") },
      { status: getApiErrorStatus(error) },
    );
  }
}
