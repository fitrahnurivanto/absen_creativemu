"use client";

import { ArrowLeftRight, Bell, ChevronRight, Clock3, PhoneCall } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveGps } from "@/hooks/useLiveGps";
import { inter } from "@/lib/inter-font";
import { GradientLink } from "./EmployeeUI";

export type HomeMobileProps = {
  user: { name: string; profile_photo?: string | null };
  roleLabel: string;
  attendance: {
    checkIn: string;
    checkOut: string;
    status: string;
    workModeLabel: string;
  };
  announcement: {
    title: string;
    content?: string;
    imageUrl?: string | null;
  } | null;
  hasUnread: boolean;
  onReadAnnouncements: () => void;
};

const WHATSAPP_FALLBACK = "https://wa.me/6282123459565";

function toSeconds(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

function useJakartaClock() {
  const [clock, setClock] = useState({ time: "--:--:--", date: "", seconds: -1 });

  useEffect(() => {
    const timeFormat = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const dateFormat = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    function tick() {
      const now = new Date();
      const time = timeFormat.format(now);
      setClock({
        time,
        date: dateFormat.format(now),
        seconds: toSeconds(time) ?? -1,
      });
    }

    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  return clock;
}

function useWhatsappLink() {
  const [link, setLink] = useState(WHATSAPP_FALLBACK);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const response = await fetch("/api/admin-contact-number", {
          cache: "no-store",
        });
        const data = await response.json();
        const digits = String(data?.number?.phone_number ?? "").replace(/\D/g, "");

        if (mounted) setLink(digits ? `https://wa.me/${digits}` : WHATSAPP_FALLBACK);
      } catch {
        if (mounted) setLink(WHATSAPP_FALLBACK);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return link;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function HomeMobile({
  user,
  roleLabel,
  attendance,
  announcement,
  hasUnread,
  onReadAnnouncements,
}: HomeMobileProps) {
  const clock = useJakartaClock();
  const gps = useLiveGps();
  const whatsappLink = useWhatsappLink();

  const hasCheckedIn = attendance.checkIn !== "--:--";
  const hasCheckedOut = attendance.checkOut !== "--:--";

  const checkInSeconds = toSeconds(attendance.checkIn);
  const checkOutSeconds = toSeconds(attendance.checkOut);
  const durationText =
    checkInSeconds === null || clock.seconds < 0
      ? "--:--:--"
      : formatDuration((checkOutSeconds ?? clock.seconds) - checkInSeconds);

  const radiusText =
    gps.status === "denied"
      ? "Izin lokasi mati"
      : gps.status === "unavailable"
        ? "GPS tidak tersedia"
        : gps.status === "loading"
          ? "Mencari lokasi..."
          : gps.distance !== null
            ? `Radius: ${gps.distance}m`
            : "Di luar radius";

  const gpsLive = gps.status === "live";

  return (
    <div className={`${inter.className} px-[14px] pb-6 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] text-black`}>
      {/* Header */}
      <header className="flex items-center gap-3">
        {user.profile_photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.profile_photo}
            alt={user.name || "Profil"}
            className="h-[50px] w-[50px] shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-[#dfe6f8] text-sm font-bold text-[#2468e4]">
            {initials(user.name)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[#6b6b6b]">Selamat Datang</p>
          <h1 className="truncate text-[17px] font-bold leading-tight">
            {user.name || "Memuat profil..."}
          </h1>
          {roleLabel ? (
            <p className="truncate text-[13px] text-[#6b6b6b]">{roleLabel}</p>
          ) : null}
        </div>

        <a
          href={whatsappLink}
          target="_blank"
          rel="noreferrer"
          aria-label="Hubungi admin"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#e3e3e6] text-[#2468e4] transition active:scale-95"
        >
          <PhoneCall size={19} fill="currentColor" strokeWidth={1.5} />
        </a>

        <Link
          href="/notifikasi"
          aria-label="Notifikasi"
          className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#e3e3e6] text-[#2468e4] transition active:scale-95"
        >
          <Bell size={19} fill="currentColor" strokeWidth={1.5} />
          {hasUnread ? (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#e3e3e6]" />
          ) : null}
        </Link>
      </header>

      {/* Kartu jam + GPS */}
      <section className="mt-6 rounded-[22px] bg-[linear-gradient(150deg,#2a72ec_0%,#1b58d0_55%,#0f3ea6_100%)] px-6 pb-5 pt-5 text-white shadow-[0_8px_18px_rgba(15,62,166,0.32)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px]">{clock.date || "Memuat tanggal..."}</p>
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-white/25 px-3 py-1.5 text-[13px] font-medium">
            <span
              className={`h-3 w-3 rounded-full ${gpsLive ? "bg-[#6fbf73]" : "bg-[#d6d6d6]"}`}
            />
            {gpsLive ? "LIVE GPS" : "GPS MATI"}
          </span>
        </div>

        <div className="mt-9 flex items-end justify-between gap-2">
          <p className="flex items-end gap-2">
            <span className="text-[44px] font-bold leading-none tabular-nums">
              {clock.time}
            </span>
            <span className="pb-1 text-[18px] font-bold leading-none">WIB</span>
          </p>
          <p className="pb-1 text-right text-[13px] leading-tight">{radiusText}</p>
        </div>
      </section>

      {/* Presensi hari ini */}
      <section className="mt-6 rounded-[18px] border border-[#dfe5f2] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[22px] font-semibold text-[#3a3a3c]">Presensi Hari ini</h2>
          <span className="shrink-0 rounded-full bg-[#5b86eb] px-3 py-1.5 text-[12px] font-medium text-white">
            {attendance.status}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-[10px] bg-[#f0f4fe] p-3">
            <p className="text-[13px] text-[#6b6b6b]">Presensi Masuk</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-[28px] font-semibold tabular-nums leading-tight">
                {attendance.checkIn}
              </span>
              <span className="text-[12px] font-bold">WIB</span>
            </p>
            <p className="text-[13px] font-semibold text-[#1c4fbf]">
              {hasCheckedIn ? attendance.workModeLabel || "Tercatat" : "Belum masuk"}
            </p>
          </div>

          <div className="rounded-[10px] bg-[#f0f4fe] p-3">
            <p className="text-[13px] text-[#6b6b6b]">Presensi Pulang</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-[28px] font-semibold tabular-nums leading-tight">
                {attendance.checkOut}
              </span>
              <span className="text-[12px] font-bold">WIB</span>
            </p>
            <p className="text-[13px] text-black">
              {hasCheckedOut ? "Selesai" : "Dijadwalkan"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 rounded-[10px] bg-[#eef2fd] px-3 py-4">
          <p className="flex items-center gap-2 text-[14px] text-[#6b6b6b]">
            <Clock3 size={17} />
            Durasi Kerja Aktif :
          </p>
          <p className="text-[22px] font-bold tabular-nums text-[#1c4fbf]">
            {durationText}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <GradientLink href="/presensi" disabled={hasCheckedIn}>
            Presensi Masuk
          </GradientLink>
          <GradientLink href="/presensi" disabled={!hasCheckedIn || hasCheckedOut}>
            Presensi Pulang
          </GradientLink>
        </div>
      </section>

      {/* Tukar shift */}
      <Link
        href="/tukar-shift"
        className="mt-5 flex items-center gap-3 rounded-[14px] border border-[#dfe5f2] bg-white p-3 transition active:scale-[0.99]"
      >
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-[#eef2fd] text-[#2468e4]">
          <ArrowLeftRight size={22} strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold leading-tight">Tukar Shift</span>
          <span className="block text-[13px] text-[#6b6b6b]">
            Ajukan tukar jadwal dengan rekan
          </span>
        </span>
        <ChevronRight size={22} className="shrink-0 text-[#8e8e93]" />
      </Link>

      {/* Pengumuman */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="pl-1 text-[22px] font-semibold text-[#3a3a3c]">Pengumuman</h2>
        <Link
          href="/pengumuman"
          onClick={onReadAnnouncements}
          className="text-[13px] font-semibold text-[#2468e4]"
        >
          Lihat Lainnya
        </Link>
      </div>

      {announcement ? (
        <Link
          href="/pengumuman"
          onClick={onReadAnnouncements}
          className="relative mt-3 block overflow-hidden rounded-[10px] bg-[linear-gradient(120deg,#0b1b4d_0%,#1a3fa6_100%)] text-white"
          style={
            announcement.imageUrl
              ? {
                  backgroundImage: `url('${announcement.imageUrl}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <div className={`px-5 py-5 ${announcement.imageUrl ? "bg-black/35" : ""}`}>
            <p className="line-clamp-2 text-[18px] font-bold leading-snug">
              {announcement.title}
            </p>
            {announcement.content ? (
              <p className="mt-1.5 line-clamp-2 text-[13px] text-white/80">
                {announcement.content}
              </p>
            ) : null}
          </div>
        </Link>
      ) : (
        <div className="mt-3 rounded-[10px] border border-dashed border-[#c9d3ea] bg-white px-5 py-8 text-center text-[13px] text-[#6b6b6b]">
          Belum ada pengumuman.
        </div>
      )}
    </div>
  );
}
