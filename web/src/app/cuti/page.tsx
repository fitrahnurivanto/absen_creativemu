"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import MobileShell from "@/components/MobileShell";
import {
  figmaButton,
  figmaInputSoft,
  figmaLabel,
  figmaTextareaSoft,
} from "@/components/ui/FigmaUI";
import { AppLoadingState } from "@/components/ui/AppUI";

type LeaveRequest = {
  id: string;
  leaveType: string;
  leaveTypeLabel: string;
  startDate: string;
  startDateIso?: string | null;
  endDate: string;
  endDateIso?: string | null;
  totalDays: number;
  reason: string;
  status: string;
  statusLabel: string;
  adminNote: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  createdAt: string | null;
};

type LeaveStats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

type LeaveResponse = {
  success: boolean;
  message?: string;
  error?: string;
  requests?: LeaveRequest[];
  leaveRequests?: LeaveRequest[];
  request?: LeaveRequest;
  leaveRequest?: LeaveRequest;
  stats?: LeaveStats;
};

type PageAlert = {
  type: "success" | "error" | "warning";
  title: string;
  message: string;
} | null;

const emptyStats: LeaveStats = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
};

function getTodayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function readJsonResponse(response: Response): Promise<LeaveResponse> {
  const text = await response.text();

  if (!text) {
    return {
      success: false,
      message:
        "Response API kosong. Restart server dan pastikan route /api/leave-requests mengembalikan NextResponse.json.",
      error:
        "Response API kosong. Restart server dan pastikan route /api/leave-requests mengembalikan NextResponse.json.",
      requests: [],
      leaveRequests: [],
    };
  }

  try {
    return JSON.parse(text);
  } catch {
    console.error("API_BUKAN_JSON:", text);

    return {
      success: false,
      message:
        "API mengembalikan HTML/error page. Cek terminal Next.js untuk detail error.",
      error:
        "API mengembalikan HTML/error page. Cek terminal Next.js untuk detail error.",
      requests: [],
      leaveRequests: [],
    };
  }
}

function getStatusStyle(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "approved") return "bg-[#c7f5d0] text-[#12843a]";
  if (normalized === "rejected") return "bg-[#fcc9c9] text-[#c42323]";

  return "bg-[#c9dcfb] text-[#1f5fd6]";
}

function getStatusTitle(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "approved") return "Pengajuan disetujui";
  if (normalized === "rejected") return "Pengajuan ditolak";

  return "Menunggu Persetujuan";
}

function getStatusBadgeLabel(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";

  return "Pending";
}

function formatSubmittedDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

const leaveTypeOptions = [
  { value: "sick", label: "Sakit" },
  { value: "annual", label: "Cuti" },
  { value: "permission", label: "Izin" },
  { value: "overtime", label: "Lembur" },
  { value: "other", label: "Lainnya" },
];

function getStatusIcon(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "approved") return CheckCircle2;
  if (normalized === "rejected") return XCircle;

  return Clock3;
}

function countDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const diffMs = end.getTime() - start.getTime();

  if (diffMs < 0) return 0;

  return Math.floor(diffMs / 86400000) + 1;
}

function getAlertClass(type: "success" | "error" | "warning") {
  if (type === "success") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (type === "error") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  return "border-amber-100 bg-amber-50 text-amber-700";
}

function getAlertIcon(type: "success" | "error" | "warning") {
  if (type === "success") return CheckCircle2;
  if (type === "error") return XCircle;

  return AlertTriangle;
}

export default function LeaveRequestPage() {
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTimeOvertime, setStartTimeOvertime] = useState("17:00");
  const [endTimeOvertime, setEndTimeOvertime] = useState("20:00");
  const [reason, setReason] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [stats, setStats] = useState<LeaveStats>(emptyStats);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pageAlert, setPageAlert] = useState<PageAlert>(null);

  const todayDate = useMemo(() => {
    return getTodayDateInputValue();
  }, []);

  const totalDays = useMemo(() => {
    return countDays(startDate, endDate);
  }, [startDate, endDate]);

  const overtimeDurationMinutes = useMemo(() => {
    if (leaveType !== "overtime") return 0;
    if (!startTimeOvertime || !endTimeOvertime) return 0;

    const [startH, startM] = startTimeOvertime.split(":").map(Number);
    const [endH, endM] = endTimeOvertime.split(":").map(Number);

    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    return endTotal - startTotal;
  }, [leaveType, startTimeOvertime, endTimeOvertime]);

  const overtimeDurationText = useMemo(() => {
    if (overtimeDurationMinutes <= 0) return "0 jam";
    const h = Math.floor(overtimeDurationMinutes / 60);
    const m = overtimeDurationMinutes % 60;

    if (h > 0 && m > 0) return `${h} jam ${m} menit`;
    if (h > 0) return `${h} jam`;
    return `${m} menit`;
  }, [overtimeDurationMinutes]);

  async function getLeaveRequests() {
    try {
      setIsLoading(true);

      const response = await fetch("/api/leave-requests", {
        method: "GET",
        cache: "no-store",
      });

      const data = await readJsonResponse(response);

      if (!response.ok || !data.success) {
        setRequests([]);
        setStats(emptyStats);
        setPageAlert({
          type: "error",
          title: "Gagal mengambil pengajuan",
          message:
            data.message ||
            data.error ||
            "Gagal mengambil data pengajuan cuti.",
        });
        return;
      }

      setRequests(data.requests || data.leaveRequests || []);
      setStats(data.stats || emptyStats);
    } catch (error) {
      console.error("GET_LEAVE_REQUESTS_ERROR:", error);

      setRequests([]);
      setStats(emptyStats);
      setPageAlert({
        type: "error",
        title: "Terjadi kesalahan",
        message: "Gagal mengambil pengajuan cuti.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (leaveType === "overtime") {
      if (!startDate || !reason.trim()) {
        setPageAlert({
          type: "warning",
          title: "Data belum lengkap",
          message: "Tanggal lembur, jam start-selesai, dan deskripsi pekerjaan lembur wajib diisi.",
        });
        return;
      }

      if (overtimeDurationMinutes < 120) {
        setPageAlert({
          type: "warning",
          title: "Durasi lembur tidak memenuhi syarat",
          message: "Pengajuan lembur terhitung dan hanya diizinkan jika durasi 2 jam atau lebih (≥ 120 menit).",
        });
        return;
      }
    } else {
      if (!leaveType || !startDate || !endDate || !reason.trim()) {
        setPageAlert({
          type: "warning",
          title: "Data belum lengkap",
          message:
            "Jenis pengajuan, tanggal mulai, tanggal selesai, dan alasan wajib diisi.",
        });
        return;
      }

      if (startDate < todayDate) {
        setPageAlert({
          type: "warning",
          title: "Tanggal mulai tidak valid",
          message: "Tanggal mulai tidak boleh kurang dari tanggal hari ini.",
        });
        return;
      }

      if (totalDays <= 0) {
        setPageAlert({
          type: "warning",
          title: "Tanggal tidak valid",
          message: "Tanggal selesai tidak boleh lebih awal dari tanggal mulai.",
        });
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const formData = new FormData();
      formData.append("leaveType", leaveType);
      const effectiveEndDate = leaveType === "overtime" ? startDate : endDate;
      formData.append("startDate", startDate);
      formData.append("endDate", effectiveEndDate);

      const finalReason =
        leaveType === "overtime"
          ? `[Lembur: ${startTimeOvertime} - ${endTimeOvertime} (${overtimeDurationText})] ${reason.trim()}`
          : reason.trim();
      formData.append("reason", finalReason);

      if (attachmentFile) {
        formData.append("attachment", attachmentFile);
      }

      const response = await fetch("/api/leave-requests", {
        method: "POST",
        body: formData,
      });

      const data = await readJsonResponse(response);

      if (!response.ok || !data.success) {
        setPageAlert({
          type: "error",
          title: "Gagal mengirim pengajuan",
          message:
            data.message || data.error || "Gagal mengirim pengajuan.",
        });
        return;
      }

      setLeaveType("annual");
      setStartDate("");
      setEndDate("");
      setReason("");
      setAttachmentFile(null);

      setPageAlert({
        type: "success",
        title: "Pengajuan terkirim",
        message:
          data.message ||
          "Pengajuan berhasil dikirim dan menunggu persetujuan admin.",
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notification-count-changed"));
      }

      await getLeaveRequests();
    } catch (error) {
      console.error("SUBMIT_LEAVE_REQUEST_ERROR:", error);

      setPageAlert({
        type: "error",
        title: "Terjadi kesalahan",
        message: "Gagal mengirim pengajuan.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    void getLeaveRequests();
  }, []);

  return (
    <MobileShell variant="employee">
      <div className="min-h-dvh bg-[#f4f8ff]">
      <div className="hidden md:block">
        <AppHeader title="Pengajuan Cuti & Lembur" rightLabel="Cuti" />
      </div>

      <section className="mx-auto grid max-w-5xl items-start gap-8 px-8 pb-32 pt-8 md:px-10 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          suppressHydrationWarning
          onSubmit={handleSubmit}
          noValidate
          className="h-fit space-y-5 self-start"
        >
          {pageAlert ? (
            <div
              className={`flex items-start justify-between gap-3 rounded-2xl border p-4 ${getAlertClass(
                pageAlert.type,
              )}`}
            >
              <div className="flex gap-3">
                {(() => {
                  const AlertIcon = getAlertIcon(pageAlert.type);

                  return (
                    <AlertIcon
                      size={21}
                      strokeWidth={2.7}
                      className="mt-0.5 shrink-0"
                    />
                  );
                })()}

                <div>
                  <p className="text-sm font-black">{pageAlert.title}</p>
                  <p className="mt-1 text-sm font-semibold leading-6">
                    {pageAlert.message}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPageAlert(null)}
                className="rounded-xl bg-white/70 p-2 transition hover:bg-white active:scale-[0.96]"
              >
                <X size={17} />
              </button>
            </div>
          ) : null}


          <div className="grid grid-cols-3 gap-3">
            {leaveTypeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setLeaveType(option.value)}
                className={`h-[60px] rounded-xl text-[17px] font-medium shadow-sm transition active:scale-[0.97] ${
                  leaveType === option.value
                    ? "border-2 border-[#0559e0] bg-[#eaf0fd] text-[#0559e0]"
                    : "border border-[#e3e8f2] bg-white text-[#111]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {leaveType === "overtime" ? (
            <>
              <div>
                <label className={figmaLabel}>Tanggal Lembur</label>
                <div className="relative">
                  <CalendarDays
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="date"
                    value={startDate}
                    min={todayDate}
                    onChange={(event) => {
                      setStartDate(event.target.value);
                      setEndDate(event.target.value);
                    }}
                    className={`${figmaInputSoft} cursor-pointer pl-11`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={figmaLabel}>Jam Mulai</label>
                  <input
                    type="time"
                    value={startTimeOvertime}
                    onChange={(e) => setStartTimeOvertime(e.target.value)}
                    className={`${figmaInputSoft} cursor-pointer`}
                  />
                </div>

                <div>
                  <label className={figmaLabel}>Jam Selesai</label>
                  <input
                    type="time"
                    value={endTimeOvertime}
                    onChange={(e) => setEndTimeOvertime(e.target.value)}
                    className={`${figmaInputSoft} cursor-pointer`}
                  />
                </div>
              </div>

                <div className={`rounded-2xl border p-4 ${overtimeDurationMinutes >= 120 ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-amber-100 bg-amber-50 text-amber-800"}`}>
                  <p className="text-xs font-black uppercase tracking-wider">Total Durasi Lembur</p>
                  <p className="mt-1 text-2xl font-black">{overtimeDurationText}</p>
                  {overtimeDurationMinutes < 120 ? (
                    <p className="mt-1 text-xs font-bold text-amber-700">
                      ⚠️ Lembur minimal 2 jam (120 menit) untuk dapat diajukan.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs font-bold text-emerald-700">
                      ✓ Durasi memenuhi syarat lembur (≥ 2 jam).
                    </p>
                  )}
                </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={figmaLabel}>Tanggal Mulai</label>
                  <div className="relative">
                    <CalendarDays
                      size={18}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="date"
                      value={startDate}
                      min={todayDate}
                      onChange={(event) => {
                        const nextStartDate = event.target.value;

                        setStartDate(nextStartDate);

                        if (endDate && nextStartDate > endDate) {
                          setEndDate(nextStartDate);
                        }
                      }}
                      className={`${figmaInputSoft} cursor-pointer pl-10 pr-2`}
                    />
                  </div>
                </div>

                <div>
                  <label className={figmaLabel}>Tanggal Selesai</label>
                  <div className="relative">
                    <CalendarDays
                      size={18}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || todayDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      className={`${figmaInputSoft} cursor-pointer pl-10 pr-2`}
                    />
                  </div>
                </div>
              </div>

              <p className="-mt-2 px-1 text-sm text-slate-500">
                Total Hari:{" "}
                <span className="font-semibold text-[#0a3a8c]">
                  {totalDays} hari
                </span>
              </p>
            </>
          )}

          <div>
            <label className={figmaLabel}>Alasan</label>
            <textarea
              suppressHydrationWarning
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Tuliskan alasan Pengajuan"
              className={figmaTextareaSoft}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className={`${figmaLabel}`}>Dokumen Pendukung</label>
              <span className="mb-2 text-[11px] text-slate-400">(Opsional)</span>
            </div>

            {attachmentFile ? (
              <div className="flex items-center justify-between rounded-xl border border-[#dbe6f7] bg-white p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#eaf0fd] text-[#2870ea]">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {attachmentFile.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {(attachmentFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachmentFile(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#c9d3e6] bg-[#eaf0fd] px-4 py-8 text-center transition active:scale-[0.99]">
                <Upload size={36} strokeWidth={2.2} className="text-[#2870ea]" />
                <p className="mt-2 text-lg font-semibold text-[#2870ea]">
                  Upload File/Foto
                </p>
                <p className="text-sm text-slate-500">
                  PDF, JPG, PNG, atau WEBP maks. 5MB
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      setPageAlert({
                        type: "warning",
                        title: "Ukuran file terlalu besar",
                        message: "Maksimal ukuran file lampiran adalah 5MB.",
                      });
                      return;
                    }
                    setAttachmentFile(file);
                  }}
                />
              </label>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`${figmaButton} mt-2`}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Mengirim...
              </>
            ) : (
              "Ajukan Permohonan"
            )}
          </button>
        </form>

        <div className="min-w-0 space-y-3">
          <div>
            <h2 className="text-xl font-bold text-[#111]">Status Pengajuan</h2>
            <p className="mt-1 text-xs text-slate-500">
              Total {stats.total} · Menunggu {stats.pending} · Disetujui{" "}
              {stats.approved}
            </p>
          </div>

          {isLoading ? (
            <AppLoadingState text="Memuat pengajuan cuti..." />
          ) : requests.length === 0 ? (
            <div className="rounded-xl border border-[#dbe6f7] bg-white p-5 text-sm text-slate-500 shadow-sm">
              Belum ada pengajuan cuti.
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((item) => {
                const StatusIcon = getStatusIcon(item.status);
                const noteText =
                  item.adminNote ||
                  (item.status.toLowerCase() === "pending"
                    ? "menunggu verifikasi admin"
                    : "");

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[#dbe6f7] bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-bold leading-6 text-[#111]">
                        {getStatusTitle(item.status)}
                      </h3>

                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${getStatusStyle(
                          item.status,
                        )}`}
                      >
                        <StatusIcon size={13} strokeWidth={2.6} />
                        {getStatusBadgeLabel(item.status)}
                      </span>
                    </div>

                    <p className="mt-1.5 text-sm font-medium text-[#111]">
                      {item.leaveTypeLabel} · {item.startDate} - {item.endDate}{" "}
                      ({item.totalDays} hari)
                    </p>

                    <p className="mt-1 text-[15px] leading-5 text-slate-500">
                      Diajukan {formatSubmittedDate(item.createdAt)}
                      {noteText ? `, Catatan: ${noteText}` : ""}
                    </p>

                    {item.reason ? (
                      <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-slate-500">
                        Alasan: {item.reason}
                      </p>
                    ) : null}

                    {item.attachmentUrl ? (
                      <a
                        href={item.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#eaf0fd] px-3 py-2 text-xs font-semibold text-[#2870ea] transition active:scale-[0.98]"
                      >
                        <FileText size={15} />
                        Lihat Lampiran
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      </div>

      <BottomNav />
    </MobileShell>
  );
}
