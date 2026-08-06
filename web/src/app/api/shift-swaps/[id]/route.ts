import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api-errors";
import {
  findActiveLeaveForDate,
  formatJakartaDate,
  getLeaveTypeLabel,
} from "@/lib/leave-attendance-guard";
import { prisma } from "@/lib/prisma";
import { ensureShiftSwapTable } from "@/lib/shift-swap-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getApprovalLeaveBlockMessage(params: {
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

  const employeeName = requesterLeave
    ? params.requesterName || "Pengaju"
    : params.targetUserName || "Kamu";
  const leaveLabel = getLeaveTypeLabel(blockedLeave.leave_type);

  return `${employeeName} sedang dalam periode ${leaveLabel} pada ${formatJakartaDate(
    params.swapDate,
  )}. Tukar shift tidak dapat disetujui kecuali untuk periode lembur.`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(req);
    await ensureShiftSwapTable();

    const resolvedParams = await params;
    const swapId = resolvedParams.id;
    const body = await req.json();
    const action = String(body.action || "").toLowerCase().trim();

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "Aksi tidak valid. Pilih setuju (approve) atau tolak (reject)." },
        { status: 400 },
      );
    }

    const swapRequest = await prisma.shiftSwapRequest.findUnique({
      where: { id: swapId },
      include: {
        requester: { select: { id: true, name: true, shift_id: true } },
        target_user: { select: { id: true, name: true, shift_id: true } },
      },
    });

    if (!swapRequest) {
      return NextResponse.json(
        { error: "Pengajuan tukar shift tidak ditemukan." },
        { status: 404 },
      );
    }

    if (swapRequest.target_user_id !== user.id) {
      return NextResponse.json(
        { error: "Kamu tidak memiliki akses untuk menanggapi pengajuan tukar shift ini." },
        { status: 403 },
      );
    }

    if (swapRequest.status !== "pending") {
      return NextResponse.json(
        { error: `Pengajuan ini sudah ${swapRequest.status === "approved" ? "disetujui" : "ditolak"}.` },
        { status: 400 },
      );
    }

    if (action === "approve") {
      const leaveBlockMessage = await getApprovalLeaveBlockMessage({
        requesterId: swapRequest.requester_id,
        requesterName: swapRequest.requester.name,
        targetUserId: swapRequest.target_user_id,
        targetUserName: swapRequest.target_user.name,
        swapDate: swapRequest.swap_date,
      });

      if (leaveBlockMessage) {
        return NextResponse.json({ error: leaveBlockMessage }, { status: 400 });
      }
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const updatedSwap = await prisma.shiftSwapRequest.update({
      where: { id: swapId },
      data: { status: newStatus },
    });

    if (action === "approve") {
      const reqShiftId = swapRequest.requester.shift_id;
      const targetShiftId = swapRequest.target_user.shift_id;

      if (reqShiftId && targetShiftId) {
        await prisma.user.update({
          where: { id: swapRequest.requester_id },
          data: { shift_id: targetShiftId },
        });
        await prisma.user.update({
          where: { id: swapRequest.target_user_id },
          data: { shift_id: reqShiftId },
        });
      }
    }

    try {
      await prisma.adminNotification.create({
        data: {
          user_id: swapRequest.requester_id,
          type: "shift_swap",
          title: action === "approve" ? "Tukar Shift Disetujui" : "Tukar Shift Ditolak",
          message:
            action === "approve"
              ? `${swapRequest.target_user.name} menyetujui tukar shift (${swapRequest.requester_shift_name} ↔ ${swapRequest.target_shift_name}). Jadwal shift kamu otomatis disesuaikan.`
              : `${swapRequest.target_user.name} menolak pengajuan tukar shift (${swapRequest.requester_shift_name} ↔ ${swapRequest.target_shift_name}).`,
          status: "unread",
        },
      });
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      message:
        action === "approve"
          ? `Permintaan tukar shift dari ${swapRequest.requester.name} telah kamu setujui. Shift kalian berdua otomatis ditukar!`
          : `Permintaan tukar shift dari ${swapRequest.requester.name} telah kamu tolak.`,
      request: updatedSwap,
    });
  } catch (error) {
    console.error("PATCH_SHIFT_SWAP_ERROR:", error);
    return NextResponse.json(
      { error: getApiErrorMessage(error, "Gagal memproses pengajuan tukar shift.") },
      { status: getApiErrorStatus(error) },
    );
  }
}
