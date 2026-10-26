"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  History,
  Layers,
  Loader2,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import MobileShell from "@/components/MobileShell";
import { figmaGradient } from "@/components/ui/FigmaUI";
import {
  AppEmptyState,
  AppLoadingState,
} from "@/components/ui/AppUI";

type AttendanceRecord = {
  id: string;
  date: string;
  checkIn: string;
  checkOut: string;
  checkInWorkModeLabel?: string;
  checkOutWorkModeLabel?: string;
  status: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workMinutes: number;
};

const months = [
  { value: 1, label: "Januari" },
  { value: 2, label: "Februari" },
  { value: 3, label: "Maret" },
  { value: 4, label: "April" },
  { value: 5, label: "Mei" },
  { value: 6, label: "Juni" },
  { value: 7, label: "Juli" },
  { value: 8, label: "Agustus" },
  { value: 9, label: "September" },
  { value: 10, label: "Oktober" },
  { value: 11, label: "November" },
  { value: 12, label: "Desember" },
];

const years = [2024, 2025, 2026, 2027];

function formatDateLabel(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(
    parsedDate,
  );
  const day = new Intl.DateTimeFormat("id-ID", { day: "2-digit" }).format(
    parsedDate,
  );
  const month = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(
    parsedDate,
  );

  const year = new Intl.DateTimeFormat("id-ID", { year: "numeric" }).format(
    parsedDate,
  );

  return `${weekday}, ${day} ${month} ${year}`;
}

function formatWorkDuration(minutes: number) {
  if (!minutes || minutes <= 0) return "-";

  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const remainingMinutes = String(minutes % 60).padStart(2, "0");

  return `${hours}:${remainingMinutes}:00`;
}

function HistoryMotionStyles() {
  return (
    <style>{`
      @keyframes historyEnter {
        0% {
          opacity: 0;
          transform: translateY(14px);
        }

        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes historyRowEnter {
        0% {
          opacity: 0;
          transform: translateY(10px);
        }

        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes historyIconPop {
        0% {
          opacity: 0;
          transform: scale(0.92) translateY(8px);
        }

        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      .history-enter {
        animation: historyEnter 340ms ease-out both;
      }

      .history-row-enter {
        opacity: 0;
        animation: historyRowEnter 300ms ease-out both;
      }

      .history-icon-pop {
        animation: historyIconPop 280ms ease-out both;
      }

      .history-field {
        transition:
          border-color 180ms ease,
          background-color 180ms ease,
          box-shadow 180ms ease,
          transform 180ms ease;
      }

      .history-field:focus-within {
        transform: translateY(-1px);
      }

      @media (prefers-reduced-motion: reduce) {
        .history-enter,
        .history-row-enter,
        .history-icon-pop {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }

        .history-field:focus-within {
          transform: none !important;
        }
      }
    `}</style>
  );
}

function HeroBadge({
  children,
  delay = "0ms",
}: {
  children: ReactNode;
  delay?: string;
}) {
  return (
    <span
      className="history-row-enter rounded-full bg-white/15 px-4 py-2 text-xs font-black text-white ring-1 ring-white/20"
      style={{ animationDelay: delay }}
    >
      {children}
    </span>
  );
}

function DesktopHero({
  monthLabel,
  year,
  total,
  sort,
}: {
  monthLabel: string;
  year: number;
  total: number;
  sort: "desc" | "asc";
}) {
  return (
    <section className="mx-auto hidden max-w-7xl px-10 pt-8 md:block lg:px-16">
      <div className="history-enter relative overflow-hidden rounded-[2.2rem] bg-[#123c8c] p-8 text-white shadow-2xl shadow-blue-900/25">
        <div className="relative z-10 flex items-center justify-between gap-8">
          <div className="flex items-center gap-5">
            <div className="history-icon-pop flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.6rem] bg-white/15 text-white ring-1 ring-white/20">
              <History size={38} strokeWidth={2.5} />
            </div>

            <div>
              <h1 className="text-4xl font-black tracking-tight">
                Riwayat Presensi
              </h1>

              <div className="mt-4 flex flex-wrap gap-2">
                <HeroBadge delay="80ms">
                  {monthLabel} {year}
                </HeroBadge>
                <HeroBadge delay="120ms">{total} Data</HeroBadge>
                <HeroBadge delay="160ms">
                  {sort === "desc" ? "Terbaru" : "Terlama"}
                </HeroBadge>
              </div>
            </div>
          </div>

          <div className="history-icon-pop flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white/80 ring-1 ring-white/20">
            <CalendarDays size={28} strokeWidth={2.4} />
          </div>
        </div>
      </div>
    </section>
  );
}

const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-[#b9bfc9] bg-white px-2 text-xs text-slate-600 outline-none transition focus:border-[#0559e0]";

function StatTile({
  icon: Icon,
  iconClass,
  label,
  value,
  caption,
  delay = "0ms",
}: {
  icon: typeof Layers;
  iconClass: string;
  label: string;
  value: ReactNode;
  caption: string;
  delay?: string;
}) {
  return (
    <div
      className="history-row-enter flex min-w-0 items-start gap-2 rounded-xl border border-[#dbe6f7] bg-white p-2.5 shadow-sm"
      style={{ animationDelay: delay }}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
      >
        <Icon size={18} strokeWidth={2.2} />
      </div>

      <div className="min-w-0">
        <p className="truncate text-[10px] text-slate-500">{label}</p>
        <p className="truncate text-base font-bold leading-5 text-[#111]">
          {value}
        </p>
        <p className="truncate text-[10px] text-slate-500">{caption}</p>
      </div>
    </div>
  );
}

function FilterCard({
  month,
  year,
  location,
  status,
  locationOptions,
  statusOptions,
  isLoading,
  onMonthChange,
  onYearChange,
  onLocationChange,
  onStatusChange,
  onApply,
}: {
  month: number;
  year: number;
  location: string;
  status: string;
  locationOptions: string[];
  statusOptions: string[];
  isLoading: boolean;
  onMonthChange: (value: number) => void;
  onYearChange: (value: number) => void;
  onLocationChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="history-enter rounded-xl border border-[#dbe6f7] bg-white p-3 shadow-sm">
      <div className="grid grid-cols-4 gap-2">
        <select
          value={month}
          onChange={(event) => onMonthChange(Number(event.target.value))}
          className={selectClass}
          aria-label="Bulan"
        >
          {months.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
          className={selectClass}
          aria-label="Tahun"
        >
          {years.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={location}
          onChange={(event) => onLocationChange(event.target.value)}
          className={selectClass}
          aria-label="Lokasi"
        >
          <option value="">Lokasi</option>
          {locationOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
          className={selectClass}
          aria-label="Status"
        >
          <option value="">Status</option>
          {statusOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={onApply}
        disabled={isLoading}
        className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-lg font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${figmaGradient}`}
      >
        {isLoading ? <Loader2 size={18} className="animate-spin" /> : null}
        Terapkan
      </button>
    </div>
  );
}

function AttendanceRecordCard({
  item,
  delay = "0ms",
}: {
  item: AttendanceRecord;
  delay?: string;
}) {
  const statusInfo =
    item.lateMinutes > 0
      ? { text: `Terlambat ${item.lateMinutes} Menit`, isIssue: true }
      : item.earlyLeaveMinutes > 0
        ? { text: `Pulang Cepat ${item.earlyLeaveMinutes} Menit`, isIssue: true }
        : {
            text:
              !item.status || item.status.toLowerCase() === "hadir"
                ? "Tepat Waktu"
                : item.status,
            isIssue: false,
          };

  return (
    <Link
      href={`/history/${item.id}`}
      className="history-row-enter block rounded-xl border border-[#dbe6f7] bg-white p-4 shadow-sm transition active:scale-[0.99]"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[17px] font-bold capitalize leading-6 text-[#111]">
          {formatDateLabel(item.date)}
        </h2>

        <span className="inline-flex shrink-0 items-center gap-0.5 pt-0.5 text-[11px] text-slate-500">
          Detail Presensi
          <ChevronRight size={14} />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-[#dce6f5] text-center">
        <div className="min-w-0 px-2">
          <p className="text-xs text-slate-500">Lokasi</p>
          <p className="mt-1 truncate text-[17px] font-bold text-[#0a3a8c]">
            {item.checkInWorkModeLabel || "-"}
          </p>
        </div>

        <div className="min-w-0 px-2">
          <p className="text-xs text-slate-500">Durasi</p>
          <p className="mt-1 truncate text-[17px] font-bold text-[#0a3a8c]">
            {formatWorkDuration(item.workMinutes)}
          </p>
        </div>

        <div className="min-w-0 px-2">
          <p className="text-xs text-slate-500">Status</p>
          <p
            className={`mt-1 break-words font-bold leading-5 ${
              statusInfo.isIssue
                ? "text-[13px] text-[#e11d1d]"
                : "text-[17px] text-[#0a3a8c]"
            }`}
          >
            {statusInfo.text}
          </p>
        </div>
      </div>
    </Link>
  );
}


function HistoryContent({
  isLoading,
  records,
  monthLabel,
  year,
}: {
  isLoading: boolean;
  records: AttendanceRecord[];
  monthLabel: string;
  year: number;
}) {
  if (isLoading) {
    return (
      <div className="history-row-enter">
        <AppLoadingState text="Memuat riwayat presensi..." />
      </div>
    );
  }

  if (!records.length) {
    return (
      <div className="history-row-enter">
        <AppEmptyState
          icon={<CalendarDays size={28} strokeWidth={2.6} />}
          title="Belum ada data presensi"
        />
      </div>
    );
  }

  return records.map((item, index) => (
    <AttendanceRecordCard key={item.id} item={item} delay={`${index * 55}ms`} />
  ));
}

export default function HistoryPage() {
  const today = new Date();

  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [sort] = useState<"desc" | "asc">("desc");
  const [location, setLocation] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentMonthLabel = useMemo(
    () => months.find((item) => item.value === month)?.label || "",
    [month],
  );

  const locationOptions = useMemo(
    () =>
      Array.from(
        new Set(
          records
            .map((item) => item.checkInWorkModeLabel)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [records],
  );

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set(records.map((item) => item.status).filter(Boolean)),
      ),
    [records],
  );

  const visibleRecords = useMemo(
    () =>
      records.filter(
        (item) =>
          (!location || item.checkInWorkModeLabel === location) &&
          (!statusFilter || item.status === statusFilter),
      ),
    [records, location, statusFilter],
  );

  const isCurrentMonth =
    month === today.getMonth() + 1 && year === today.getFullYear();
  const isCurrentYear = year === today.getFullYear();

  async function getHistory() {
    try {
      setIsLoading(true);

      const response = await fetch(
        `/api/attendance/history?month=${month}&year=${year}&sort=${sort}`,
        { method: "GET", cache: "no-store" },
      );

      if (!response.ok) {
        setRecords([]);
        return;
      }

      const data = await response.json();

      setRecords(data.records || []);
    } catch (error) {
      console.error("Gagal mengambil history:", error);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void getHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, sort]);

  return (
    <MobileShell variant="employee" withBottomPadding={false}>
      <HistoryMotionStyles />

      <div className="hidden md:block">
        <AppHeader
          title="Riwayat"
          rightLabel={`${currentMonthLabel} ${year}`}
          variant="employee"
        />
      </div>

      <main className="min-h-dvh bg-[#f4f8ff] pb-28 text-slate-950">
        <DesktopHero
          monthLabel={currentMonthLabel}
          year={year}
          total={visibleRecords.length}
          sort={sort}
        />

        <section className="history-enter mx-auto max-w-3xl px-5 pb-10 pt-8 md:mt-4 md:px-8">
          <FilterCard
            month={month}
            year={year}
            location={location}
            status={statusFilter}
            locationOptions={locationOptions}
            statusOptions={statusOptions}
            isLoading={isLoading}
            onMonthChange={setMonth}
            onYearChange={setYear}
            onLocationChange={setLocation}
            onStatusChange={setStatusFilter}
            onApply={getHistory}
          />

          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatTile
              icon={Layers}
              iconClass="bg-[#5b8def] text-white"
              label="Total Presensi"
              value={visibleRecords.length}
              caption="Hari Presensi"
              delay="60ms"
            />
            <StatTile
              icon={CalendarDays}
              iconClass="bg-[#c7c8f7] text-[#4b4fd6]"
              label="Bulan"
              value={currentMonthLabel}
              caption={isCurrentMonth ? "Bulan Ini" : "Bulan dipilih"}
              delay="100ms"
            />
            <StatTile
              icon={CalendarDays}
              iconClass="bg-[#c9f6d6] text-[#14a54a]"
              label="Tahun"
              value={year}
              caption={isCurrentYear ? "Tahun aktif" : "Tahun dipilih"}
              delay="140ms"
            />
          </div>

          <h2 className="mb-3 mt-7 px-1 text-2xl font-bold text-[#111]">
            Riwayat Presensi
          </h2>

          <div className="space-y-3">
            <HistoryContent
              isLoading={isLoading}
              records={visibleRecords}
              monthLabel={currentMonthLabel}
              year={year}
            />
          </div>
        </section>

        <BottomNav />
      </main>
    </MobileShell>
  );
}
