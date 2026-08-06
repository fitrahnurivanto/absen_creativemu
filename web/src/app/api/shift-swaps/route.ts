import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api-errors";
import {
  findActiveLeaveForDate,
  formatJakartaDate,
  getLeaveTypeLabel,
} from "@/lib/leave-attendance-guard";
import { prisma } from "@/lib/prisma";
import {
  ensureShiftSwapTable,
  formatShiftSwapDate,
  getShiftWindowForSwapDate,
  shiftWindowsOverlap,
  toShiftSwapDate,
} from "@/lib/shift-swap-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getShiftSwapLeaveBlock(params: {
  requesterId: string;
  requesterName?: string | null;
  targetUserId: string;
  targetUserName?: string | null;
  swapDate: Date;
}) {
  const [requesterLeave, targetLeave] = await Promise.all([
    findActiveLeaveForDate({
      userId: params.requesterId,
      date: params.swapDate,
    }),
    findActiveLeaveForDate({
      userId: params.targetUserId,
      date: params.swapDate,
    }),
  ]);

  const blockedLeave = requesterLeave || targetLeave;
  if (!blockedLeave) return null;

  const isRequesterBlocked = Boolean(requesterLeave);
  const employeeName = isRequesterBlocked
    ? params.requesterName || "Kamu"
    : params.targetUserName || "Rekan kerja";
  const leaveLabel = getLeaveTypeLabel(blockedLeave.leave_type);

  return `${employeeName} sedang dalam periode ${leaveLabel} pada ${formatJakartaDate(
    params.swapDate,
  )}. Tukar shift tidak dapat diajukan kecuali untuk periode lembur.`;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    await ensureShiftSwapTable();

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        shift: { select: { name: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
    }

    const currentShiftName = user.shift?.name || "Shift Utama";

    const sentRequests = await prisma.shiftSwapRequest.findMany({
      where: { requester_id: user.id },
      include: {
        target_user: {
          select: {
            id: true,
            name: true,
            employee_code: true,
            profile_photo: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    const incomingRequests = await prisma.shiftSwapRequest.findMany({
      where: { target_user_id: user.id },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            employee_code: true,
            profile_photo: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    const pendingIncomingCount = incomingRequests.filter(
      (req) => req.status === "pending",
    ).length;

    return NextResponse.json({
      success: true,
      isEligible: true,
      currentShiftName,
      pendingIncomingCount,
      sentRequests: sentRequests.map((item) => ({
        id: item.id,
        targetUser: {
          id: item.target_user.id,
          name: item.target_user.name,
          employeeCode: item.target_user.employee_code,
          profilePhoto: item.target_user.profile_photo,
        },
        swapDate: formatShiftSwapDate(item.swap_date),
        requesterShiftName: item.requester_shift_name,
        targetShiftName: item.target_shift_name,
        reason: item.reason,
        status: item.status,
        createdAt: item.created_at.toISOString(),
      })),
      incomingRequests: incomingRequests.map((item) => ({
        id: item.id,
        requester: {
          id: item.requester.id,
          name: item.requester.name,
          employeeCode: item.requester.employee_code,
          profilePhoto: item.requester.profile_photo,
        },
        swapDate: formatShiftSwapDate(item.swap_date),
        requesterShiftName: item.requester_shift_name,
        targetShiftName: item.target_shift_name,
        reason: item.reason,
        status: item.status,
        createdAt: item.created_at.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET_SHIFT_SWAPS_ERROR:", error);
    return NextResponse.json(
      { error: getApiErrorMessage(error, "Gagal mengambil pengajuan tukar shift.") },
      { status: getApiErrorStatus(error) },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    await ensureShiftSwapTable();

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        shift: {
          select: {
            name: true,
            start_time: true,
            end_time: true,
            work_schedules: {
              select: {
                day_of_week: true,
                is_work_day: true,
                check_in_time: true,
                check_out_time: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
    }

    const requesterShiftName = user.shift?.name || "Shift Utama";

    const body = await req.json();
    const targetUserId = String(body.targetUserId || "").trim();
    const swapDateStr = String(body.swapDate || "").trim();
    const reason = String(body.reason || "").trim();

    if (!targetUserId || !swapDateStr) {
      return NextResponse.json(
        { error: "Rekan kerja tujuan dan tanggal tukar shift wajib diisi." },
        { status: 400 },
      );
    }

    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: "Kamu tidak dapat melakukan tukar shift dengan diri sendiri." },
        { status: 400 },
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        shift: {
          select: {
            name: true,
            start_time: true,
            end_time: true,
            work_schedules: {
              select: {
                day_of_week: true,
                is_work_day: true,
                check_in_time: true,
                check_out_time: true,
              },
            },
          },
        },
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "Rekan kerja tujuan tidak ditemukan." },
        { status: 404 },
      );
    }

    const targetShiftName = targetUser.shift?.name || "Shift Utama";
    const swapDate = toShiftSwapDate(swapDateStr);

    const leaveBlockMessage = await getShiftSwapLeaveBlock({
      requesterId: user.id,
      requesterName: "Kamu",
      targetUserId,
      targetUserName: targetUser.name,
      swapDate,
    });

    if (leaveBlockMessage) {
      return NextResponse.json({ error: leaveBlockMessage }, { status: 400 });
    }

    if (!user.shift || !targetUser.shift) {
      return NextResponse.json(
        { error: "Shift karyawan belum lengkap. Lengkapi shift terlebih dahulu sebelum tukar shift." },
        { status: 400 },
      );
    }

    const requesterWindow = getShiftWindowForSwapDate(user.shift, swapDate);
    const targetWindow = getShiftWindowForSwapDate(targetUser.shift, swapDate);

    if (!requesterWindow || !targetWindow) {
      return NextResponse.json(
        { error: "Jadwal kerja pada tanggal tersebut belum lengkap atau bukan hari kerja." },
        { status: 400 },
      );
    }

    if (shiftWindowsOverlap(requesterWindow, targetWindow)) {
      return NextResponse.json(
        {
          error: `${requesterWindow.shiftName} (${requesterWindow.startTime}-${requesterWindow.endTime}) tidak bisa ditukar dengan ${targetWindow.shiftName} (${targetWindow.startTime}-${targetWindow.endTime}) karena jam kerjanya masih saling bertabrakan.`,
        },
        { status: 400 },
      );
    }

    const existingPending = await prisma.shiftSwapRequest.findFirst({
      where: {
        requester_id: user.id,
        target_user_id: targetUserId,
        swap_date: swapDate,
        status: "pending",
      },
    });

    if (existingPending) {
      return NextResponse.json(
        { error: "Kamu sudah mengirim pengajuan tukar shift ke karyawan ini untuk tanggal tersebut." },
        { status: 400 },
      );
    }

    const createdSwap = await prisma.shiftSwapRequest.create({
      data: {
        requester_id: user.id,
        target_user_id: targetUserId,
        swap_date: swapDate,
        requester_shift_name: requesterShiftName,
        target_shift_name: targetShiftName,
        reason: reason || null,
        status: "pending",
      },
    });

    return NextResponse.json({
      success: true,
      message: `Pengajuan tukar shift ke ${targetUser.name} berhasil dikirim dan menunggu konfirmasi.`,
      request: createdSwap,
    });
  } catch (error) {
    console.error("POST_SHIFT_SWAP_ERROR:", error);
    return NextResponse.json(
      { error: getApiErrorMessage(error, "Gagal membuat pengajuan tukar shift.") },
      { status: getApiErrorStatus(error) },
    );
  }
}
