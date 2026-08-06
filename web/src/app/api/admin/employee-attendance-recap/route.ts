import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/api-auth";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { ensureWfhQuotaColumn } from "@/lib/wfh-quota-schema";

export const runtime = "nodejs";

type LeaveType = "annual" | "permission" | "sick" | "other";

type WorkDayName =
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY";

type DailyAttendanceCategory =
  | "hadir"
  | "terlambat"
  | "wfh"
  | "kunjungan"
  | "izin_sakit"
  | "cuti";

const workDayByUtcDay: WorkDayName[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

function parseDateParam(value: string, label: string) {
  const dateText = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new Error(`${label} tidak valid.`);
  }

  const date = new Date(`${dateText}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} tidak valid.`);
  }

  return date;
}

function parseOptionalDateParam(value: string | null, label: string) {
  const dateText = String(value || "").trim();

  if (!dateText) return null;

  return parseDateParam(dateText, label);
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getDefaultMonthStartDate() {
  const date = new Date();

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(1);

  return date;
}

function getDefaultTodayDate() {
  const date = new Date();

  date.setUTCHours(0, 0, 0, 0);

  return date;
}

function minDate(first: Date, second: Date) {
  return first.getTime() <= second.getTime() ? first : second;
}

function clampDate(value: Date, min: Date, max: Date) {
  if (value.getTime() < min.getTime()) return min;
  if (value.getTime() > max.getTime()) return max;

  return value;
}

function eachDateKey(startDate: Date, endDate: Date) {
  const dates: string[] = [];
  const current = new Date(startDate);

  while (current.getTime() <= endDate.getTime()) {
    dates.push(toDateKey(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function getWorkDayKeys(
  startDate: Date,
  endDate: Date,
  workSchedules?: { day_of_week: string; is_work_day: boolean }[],
) {
  const configuredWorkDays = new Set(
    (workSchedules || [])
      .filter((schedule) => schedule.is_work_day)
      .map((schedule) => schedule.day_of_week),
  );
  const hasSchedule = (workSchedules || []).length > 0;
  const workDayKeys = new Set<string>();
  const current = new Date(startDate);

  while (current.getTime() <= endDate.getTime()) {
    const dayName = workDayByUtcDay[current.getUTCDay()];

    if (!hasSchedule || configuredWorkDays.has(dayName)) {
      workDayKeys.add(toDateKey(current));
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return workDayKeys;
}

function createEmptySummary() {
  return {
    totalHariKerja: 0,
    totalPresensi: 0,
    hadir: 0,
    terlambat: 0,
    terlambatHari: 0,
    menunggu: 0,
    izin: 0,
    sakit: 0,
    cuti: 0,
    lainnya: 0,
    wfh: 0,
    kunjungan: 0,
    totalWorkMinutes: 0,
    gajiPokok: 0,
    potonganPerHari: 0,
    estimasiPotonganTidakMasuk: 0,
    estimasiSalary: 0,
  };
}

function normalizeLeaveType(type: string): LeaveType {
  const normalized = type.toLowerCase();

  if (normalized === "permission") return "permission";
  if (normalized === "sick") return "sick";
  if (normalized === "annual" || normalized === "annual_leave") {
    return "annual";
  }

  return "other";
}

function normalizeWorkMode(value?: string | null) {
  const normalized = String(value || "").toLowerCase();

  if (normalized === "wfh" || normalized === "wfc") return "wfh";
  if (normalized === "visit" || normalized === "kunjungan") return "kunjungan";

  return "office";
}

function calculateWorkMinutes(
  checkInTime?: Date | null,
  checkOutTime?: Date | null,
) {
  if (!checkInTime || !checkOutTime) return 0;

  const diffMs = checkOutTime.getTime() - checkInTime.getTime();

  if (diffMs <= 0) return 0;

  return Math.ceil(diffMs / 60000);
}

async function getCheckOutWorkModeByAttendanceId(attendanceIds: string[]) {
  if (attendanceIds.length === 0) return new Map<string, string | null>();

  const placeholders = attendanceIds.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<
    { id: string; check_out_work_mode: string | null }[]
  >(
    `SELECT \`id\`, \`check_out_work_mode\` FROM \`Attendance\` WHERE \`id\` IN (${placeholders})`,
    ...attendanceIds,
  );

  return new Map(rows.map((row) => [row.id, row.check_out_work_mode]));
}

function getAttendanceCategory(attendance: {
  status?: string | null;
  check_in_status?: string | null;
  late_minutes?: number | null;
  work_mode?: string | null;
  check_out_work_mode?: string | null;
}): DailyAttendanceCategory {
  const workMode = normalizeWorkMode(attendance.work_mode);
  const checkOutWorkMode = normalizeWorkMode(attendance.check_out_work_mode);

  if (checkOutWorkMode === "kunjungan") return "kunjungan";
  if (workMode === "wfh") return "wfh";
  if (workMode === "kunjungan") return "kunjungan";

  if (
    attendance.check_in_status === "LATE" ||
    Number(attendance.late_minutes || 0) > 0 ||
    attendance.status === "LATE"
  ) {
    return "terlambat";
  }

  return "hadir";
}

function getLeaveCategory(leaveType: LeaveType): DailyAttendanceCategory {
  if (leaveType === "annual") return "cuti";

  return "izin_sakit";
}

export async function GET(req: NextRequest) {
  try {
    await requireOwner(req);
    await ensureWfhQuotaColumn();

    const { searchParams } = new URL(req.url);
    const employeeId = String(searchParams.get("employeeId") || "").trim();
    const requestedStartDate = parseOptionalDateParam(
      searchParams.get("startDate"),
      "Tanggal mulai",
    );
    const requestedEndDate = parseOptionalDateParam(
      searchParams.get("endDate"),
      "Tanggal akhir",
    );

    const employees = await prisma.user.findMany({
      where: employeeId
        ? { id: employeeId }
        : {
            role: {
              in: ["employee", "user", "EMPLOYEE", "USER"],
            },
          },
      select: {
        id: true,
        name: true,
        employee_code: true,
        profile_photo: true,
        employment_start_date: true,
        employment_end_date: true,
        base_salary: true,
        employment_status: true,
        status: true,
        shift: {
          select: {
            name: true,
            work_schedules: {
              select: {
                day_of_week: true,
                is_work_day: true,
              },
            },
          },
        },
        department: {
          select: {
            name: true,
          },
        },
        registered_office: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    if (employeeId && employees.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Karyawan tidak ditemukan.",
          employees: [],
        },
        { status: 404 },
      );
    }

    const selectedEmployee = employeeId ? employees[0] : null;
    const todayDate = getDefaultTodayDate();
    const defaultStartDate =
      selectedEmployee?.employment_start_date || getDefaultMonthStartDate();
    const defaultEndDate = selectedEmployee?.employment_end_date
      ? minDate(selectedEmployee.employment_end_date, todayDate)
      : todayDate;
    const startDate = requestedStartDate || defaultStartDate;
    const endDate = requestedEndDate || defaultEndDate;

    if (startDate.getTime() > endDate.getTime()) {
      throw new Error("Tanggal mulai tidak boleh melewati tanggal akhir.");
    }

    const employeeSummaries = new Map(
      employees.map((employee) => {
        const summary = createEmptySummary();
        const workDayKeys = getWorkDayKeys(
          startDate,
          endDate,
          employee.shift?.work_schedules,
        );

        summary.totalHariKerja = workDayKeys.size;

        return [employee.id, summary];
      }),
    );
    const employeeWorkDayKeys = new Map(
      employees.map((employee) => [
        employee.id,
        getWorkDayKeys(startDate, endDate, employee.shift?.work_schedules),
      ]),
    );
    const employeeDailyRecords = new Map(
      employees.map((employee) => [
        employee.id,
        new Map<
          string,
          {
            id?: string;
            date: string;
            category: DailyAttendanceCategory;
            checkInTime?: string | null;
            checkOutTime?: string | null;
            scheduledCheckIn?: string | null;
            scheduledCheckOut?: string | null;
            lateMinutes?: number;
            earlyLeaveMinutes?: number;
            workMinutes?: number;
            workMode?: string | null;
            checkOutWorkMode?: string | null;
            checkInStatus?: string | null;
            checkOutStatus?: string | null;
            status?: string | null;
            note?: string | null;
            lateReason?: string | null;
            earlyLeaveReason?: string | null;
            checkInLatitude?: number | null;
            checkInLongitude?: number | null;
            checkOutLatitude?: number | null;
            checkOutLongitude?: number | null;
            registeredOfficeName?: string | null;
            checkInOfficeName?: string | null;
            checkOutOfficeName?: string | null;
          }
        >(),
      ]),
    );
    const attendances = await prisma.attendance.findMany({
      where: {
        attendance_date: {
          gte: startDate,
          lte: endDate,
        },
        user: {
          role: "employee",
          ...(employeeId ? { id: employeeId } : {}),
        },
      },
      select: {
        id: true,
        user_id: true,
        attendance_date: true,
        status: true,
        check_in_status: true,
        late_minutes: true,
        early_leave_minutes: true,
        check_in_time: true,
        check_out_time: true,
        scheduled_check_in: true,
        scheduled_check_out: true,
        work_minutes: true,
        work_mode: true,
        check_out_status: true,
        note: true,
        late_reason: true,
        early_leave_reason: true,
        check_in_latitude: true,
        check_in_longitude: true,
        check_out_latitude: true,
        check_out_longitude: true,
        registered_office: {
          select: {
            name: true,
          },
        },
        check_in_office: {
          select: {
            name: true,
          },
        },
        check_out_office: {
          select: {
            name: true,
          },
        },
      },
    });
    const checkOutWorkModeByAttendanceId =
      await getCheckOutWorkModeByAttendanceId(
        attendances.map((attendance) => attendance.id),
      );

    for (const attendance of attendances) {
      const summary = employeeSummaries.get(attendance.user_id);

      if (!summary) continue;

      summary.totalPresensi += 1;

      const hasCheckedIn =
        Boolean(attendance.check_in_time) ||
        attendance.status === "PRESENT" ||
        attendance.status === "LATE" ||
        attendance.check_in_status === "LATE";
      if (
        attendance.check_in_status === "LATE" ||
        Number(attendance.late_minutes || 0) > 0 ||
        attendance.status === "LATE"
      ) {
        summary.terlambat += Number(attendance.late_minutes || 0);
        summary.terlambatHari += 1;
      }

      if (hasCheckedIn) {
        const attendanceCategory = getAttendanceCategory({
          ...attendance,
          check_out_work_mode: checkOutWorkModeByAttendanceId.get(
            attendance.id,
          ),
        });

        summary.hadir += 1;
        if (attendanceCategory === "wfh") summary.wfh += 1;
        if (attendanceCategory === "kunjungan") summary.kunjungan += 1;
        summary.totalWorkMinutes +=
          attendance.check_in_time && attendance.check_out_time
            ? Math.max(
                Number(attendance.work_minutes || 0),
                calculateWorkMinutes(
                  attendance.check_in_time,
                  attendance.check_out_time,
                ),
              )
            : 0;
        const dateKey = toDateKey(attendance.attendance_date);
        const computedWorkMinutes =
          attendance.check_in_time && attendance.check_out_time
            ? Math.max(
                Number(attendance.work_minutes || 0),
                calculateWorkMinutes(
                  attendance.check_in_time,
                  attendance.check_out_time,
                ),
              )
            : 0;

        employeeDailyRecords.get(attendance.user_id)?.set(dateKey, {
          id: attendance.id,
          date: dateKey,
          category: attendanceCategory,
          checkInTime: attendance.check_in_time
            ? attendance.check_in_time.toISOString()
            : null,
          checkOutTime: attendance.check_out_time
            ? attendance.check_out_time.toISOString()
            : null,
          scheduledCheckIn: attendance.scheduled_check_in
            ? attendance.scheduled_check_in.toISOString()
            : null,
          scheduledCheckOut: attendance.scheduled_check_out
            ? attendance.scheduled_check_out.toISOString()
            : null,
          lateMinutes: Number(attendance.late_minutes || 0),
          earlyLeaveMinutes: Number(attendance.early_leave_minutes || 0),
          workMinutes: computedWorkMinutes,
          workMode: attendance.work_mode || "OFFICE",
          checkOutWorkMode:
            checkOutWorkModeByAttendanceId.get(attendance.id) || null,
          checkInStatus: attendance.check_in_status || null,
          checkOutStatus: attendance.check_out_status || null,
          status: attendance.status || null,
          note: attendance.note || null,
          lateReason: attendance.late_reason || null,
          earlyLeaveReason: attendance.early_leave_reason || null,
          checkInLatitude: attendance.check_in_latitude,
          checkInLongitude: attendance.check_in_longitude,
          checkOutLatitude: attendance.check_out_latitude,
          checkOutLongitude: attendance.check_out_longitude,
          registeredOfficeName: attendance.registered_office?.name || null,
          checkInOfficeName: attendance.check_in_office?.name || null,
          checkOutOfficeName: attendance.check_out_office?.name || null,
        });
      } else {
        summary.menunggu += 1;
      }
    }

    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        status: "approved",
        start_date: {
          lte: endDate,
        },
        end_date: {
          gte: startDate,
        },
        user: {
          role: "employee",
          ...(employeeId ? { id: employeeId } : {}),
        },
      },
      select: {
        user_id: true,
        leave_type: true,
        start_date: true,
        end_date: true,
      },
    });

    for (const leaveRequest of leaveRequests) {
      const summary = employeeSummaries.get(leaveRequest.user_id);

      if (!summary) continue;

      const overlapStart = clampDate(leaveRequest.start_date, startDate, endDate);
      const overlapEnd = clampDate(leaveRequest.end_date, startDate, endDate);
      const leaveType = normalizeLeaveType(leaveRequest.leave_type);
      const workDayKeys =
        employeeWorkDayKeys.get(leaveRequest.user_id) || new Set();
      const leaveDateKeys = eachDateKey(overlapStart, overlapEnd).filter(
        (dateKey) => workDayKeys.has(dateKey),
      );
      const days = leaveDateKeys.length;

      if (leaveType === "permission") {
        summary.izin += days;
      } else if (leaveType === "sick") {
        summary.sakit += days;
      } else if (leaveType === "annual") {
        summary.cuti += days;
      } else {
        summary.lainnya += days;
      }

      const category = getLeaveCategory(leaveType);

      for (const dateKey of leaveDateKeys) {
        const dailyRecords = employeeDailyRecords.get(leaveRequest.user_id);

        if (!dailyRecords || dailyRecords.has(dateKey)) continue;

        dailyRecords.set(dateKey, {
          date: dateKey,
          category,
          checkInTime: null,
          checkOutTime: null,
          lateMinutes: 0,
          workMinutes: 0,
          workMode: null,
          checkOutWorkMode: null,
          checkInStatus: null,
          checkOutStatus: null,
          status: "LEAVE",
        });
      }
    }

    for (const employee of employees) {
      const summary = employeeSummaries.get(employee.id);

      if (!summary) continue;

      const baseSalary = Number(employee.base_salary || 0);
      const deductionPerDay =
        summary.totalHariKerja > 0 ? baseSalary / summary.totalHariKerja : 0;
      const deduction = deductionPerDay * (summary.cuti + summary.sakit);

      summary.gajiPokok = baseSalary;
      summary.potonganPerHari = Math.round(deductionPerDay);
      summary.estimasiPotonganTidakMasuk = Math.round(deduction);
      summary.estimasiSalary = Math.max(Math.round(baseSalary - deduction), 0);
    }

    return NextResponse.json({
      success: true,
      startDate: toDateKey(startDate),
      endDate: toDateKey(endDate),
      employees: employees.map((employee) => {
        const records = Array.from(
          employeeDailyRecords.get(employee.id)?.values() || [],
        ).sort((first, second) => first.date.localeCompare(second.date));

        return {
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employee_code,
          profile_photo: employee.profile_photo,
          profile_photo_url: employee.profile_photo,
          employmentStartDate: employee.employment_start_date,
          employmentEndDate: employee.employment_end_date,
          employmentStatus: employee.employment_status,
          status: employee.status,
          shiftName: employee.shift?.name || null,
          departmentName: employee.department?.name || null,
          registeredOfficeName: employee.registered_office?.name || null,
          summary: employeeSummaries.get(employee.id) || createEmptySummary(),
          dailyRecords: records,
          logs: records,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: getApiErrorMessage(
          error,
          "Gagal mengambil rekap kehadiran karyawan.",
        ),
        employees: [],
      },
      {
        status: getApiErrorStatus(error),
      },
    );
  }
}
