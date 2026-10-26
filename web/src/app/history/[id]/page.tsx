"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Camera,
  Clock3,
  FileText,
  ImageIcon,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import MobileShell from "@/components/MobileShell";
import { FigmaHeader } from "@/components/ui/FigmaUI";

type LocationValue =
  | string
  | null
  | undefined
  | {
      latitude?: number | string | null;
      longitude?: number | string | null;
      lat?: number | string | null;
      lon?: number | string | null;
      lng?: number | string | null;
      accuracy?: number | string | null;
      distance?: number | string | null;
      withinRadius?: boolean | null;
      within_radius?: boolean | null;
      check_in_within_radius?: boolean | null;
      check_out_within_radius?: boolean | null;

      displayName?: string | null;
      display_name?: string | null;
      shortName?: string | null;
      short_name?: string | null;
      placeName?: string | null;
      place_name?: string | null;
      name?: string | null;

      road?: string | null;
      pedestrian?: string | null;
      footway?: string | null;
      path?: string | null;
      neighbourhood?: string | null;
      suburb?: string | null;
      village?: string | null;
      town?: string | null;
      city?: string | null;
      county?: string | null;
      municipality?: string | null;
      state_district?: string | null;
      state?: string | null;
      postcode?: string | null;
      country?: string | null;
      country_code?: string | null;

      address?: Record<string, unknown> | string | null;
      [key: string]: unknown;
    };

type AttendanceDetail = {
  id: string;
  date: string;
  checkIn: string;
  checkOut: string;
  checkInWorkModeLabel?: string;
  checkOutWorkModeLabel?: string;
  status: string;
  lateMinutes: number;
  lateReason?: string | null;
  earlyLeaveMinutes: number;
  workMinutes: number;
  visitTitle?: string | null;
  visitClientName?: string | null;
  visitAddress?: string | null;
  visitNote?: string | null;
  checkOutVisitTitle?: string | null;
  checkOutVisitClientName?: string | null;
  checkOutVisitAddress?: string | null;
  checkOutVisitNote?: string | null;
  hasCheckInPhoto: boolean;
  hasCheckOutPhoto: boolean;
  checkInLocation: LocationValue;
  checkOutLocation: LocationValue;
};

function formatMinutes(minutes: number) {
  if (!minutes || minutes <= 0) return "0 menit";

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours} jam ${remainingMinutes} menit`;
  }

  if (hours > 0) {
    return `${hours} jam`;
  }

  return `${remainingMinutes} menit`;
}

function formatClock(value?: string | null) {
  const text = String(value || "").trim();
  return text || "--:--";
}

function formatMinuteLabel(minutes: number) {
  return formatMinutes(minutes).replace("menit", "Menit").replace("jam", "Jam");
}

function hasText(value?: string | null) {
  return Boolean(String(value || "").trim());
}

function getVisitTitle(attendance: AttendanceDetail) {
  return attendance.checkOutVisitTitle || attendance.visitTitle || null;
}

function getVisitClientName(attendance: AttendanceDetail) {
  return attendance.checkOutVisitClientName || attendance.visitClientName || null;
}

function getVisitAddress(attendance: AttendanceDetail) {
  return attendance.checkOutVisitAddress || attendance.visitAddress || null;
}

function getVisitNote(attendance: AttendanceDetail) {
  return attendance.checkOutVisitNote || attendance.visitNote || null;
}

function shouldShowVisitNote(attendance: AttendanceDetail) {
  return (
    String(attendance.checkOutWorkModeLabel || "").toLowerCase() ===
      "kunjungan" ||
    hasText(getVisitTitle(attendance)) ||
    hasText(getVisitClientName(attendance)) ||
    hasText(getVisitAddress(attendance)) ||
    hasText(getVisitNote(attendance))
  );
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function getObjectLocation(location: LocationValue) {
  if (!location || typeof location !== "object") return null;

  return location;
}

function getNestedAddress(location: LocationValue) {
  const objectLocation = getObjectLocation(location);

  if (!objectLocation) return null;

  const address = objectLocation.address;

  if (!address) return null;

  if (typeof address === "string") {
    return {
      displayName: address,
    } as Record<string, unknown>;
  }

  if (typeof address === "object") {
    return address as Record<string, unknown>;
  }

  return null;
}

function getLocationCoordinate(location: LocationValue, type: "lat" | "lng") {
  const objectLocation = getObjectLocation(location);

  if (!objectLocation) return null;

  if (type === "lat") {
    return toNumber(objectLocation.latitude ?? objectLocation.lat);
  }

  return toNumber(
    objectLocation.longitude ?? objectLocation.lng ?? objectLocation.lon,
  );
}

function getLocationWithinRadius(location: LocationValue) {
  const objectLocation = getObjectLocation(location);

  if (!objectLocation) return null;

  const value =
    objectLocation.withinRadius ??
    objectLocation.within_radius ??
    objectLocation.check_in_within_radius ??
    objectLocation.check_out_within_radius;

  if (typeof value === "boolean") return value;

  return null;
}

function formatAddressFromObject(value: Record<string, unknown>) {
  const displayName =
    cleanText(value.displayName) ||
    cleanText(value.display_name) ||
    cleanText(value.shortName) ||
    cleanText(value.short_name) ||
    cleanText(value.placeName) ||
    cleanText(value.place_name);

  if (displayName) return displayName;

  const place =
    cleanText(value.name) ||
    cleanText(value.office) ||
    cleanText(value.company) ||
    cleanText(value.building) ||
    cleanText(value.amenity) ||
    cleanText(value.shop) ||
    cleanText(value.tourism);

  const road =
    cleanText(value.road) ||
    cleanText(value.pedestrian) ||
    cleanText(value.footway) ||
    cleanText(value.path);

  const area =
    cleanText(value.neighbourhood) ||
    cleanText(value.suburb) ||
    cleanText(value.village);

  const city =
    cleanText(value.city) ||
    cleanText(value.town) ||
    cleanText(value.county) ||
    cleanText(value.municipality) ||
    cleanText(value.state_district);

  const state = cleanText(value.state);
  const postcode = cleanText(value.postcode);
  const country = cleanText(value.country);

  return [place, road, area, city, state, postcode, country]
    .filter(Boolean)
    .join(", ");
}

function formatLocationText(location: LocationValue) {
  if (!location) return "";

  if (typeof location === "string") {
    return location.trim();
  }

  if (typeof location === "object") {
    const directAddress = formatAddressFromObject(
      location as Record<string, unknown>,
    );

    if (directAddress) return directAddress;

    const nestedAddress = getNestedAddress(location);

    if (nestedAddress) {
      return formatAddressFromObject(nestedAddress);
    }
  }

  return "";
}

function HistoryDetailMotionStyles() {
  return (
    <style>{`
      @keyframes historyDetailEnter {
        0% {
          opacity: 0;
          transform: translateY(14px);
        }

        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes historyDetailRowEnter {
        0% {
          opacity: 0;
          transform: translateY(10px);
        }

        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes historyDetailIconPop {
        0% {
          opacity: 0;
          transform: scale(0.92) translateY(8px);
        }

        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      @keyframes historyDetailImageEnter {
        0% {
          opacity: 0;
          transform: scale(1.025);
        }

        100% {
          opacity: 1;
          transform: scale(1);
        }
      }

      .history-detail-enter {
        animation: historyDetailEnter 340ms ease-out both;
      }

      .history-detail-row-enter {
        opacity: 0;
        animation: historyDetailRowEnter 300ms ease-out both;
      }

      .history-detail-icon-pop {
        animation: historyDetailIconPop 280ms ease-out both;
      }

      .history-detail-image-enter {
        animation: historyDetailImageEnter 420ms ease-out both;
      }

      @media (prefers-reduced-motion: reduce) {
        .history-detail-enter,
        .history-detail-row-enter,
        .history-detail-icon-pop,
        .history-detail-image-enter {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
      }
    `}</style>
  );
}

function SectionCard({
  icon: Icon,
  eyebrow,
  title,
  children,
  delay = "0ms",
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  children: ReactNode;
  delay?: string;
}) {
  return (
    <section
      className="history-detail-row-enter rounded-xl border border-[#dbe6f7] bg-white p-4 shadow-sm"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#6c9cf2] text-white">
          <Icon size={20} strokeWidth={2.2} />
        </div>

        <div>
          <p className="text-xs leading-4 text-slate-500">{eyebrow}</p>
          <h3 className="text-lg font-bold leading-6 text-[#111]">{title}</h3>
        </div>
      </div>

      <div className="mt-4">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  iconClass,
  delay = "0ms",
}: {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
  delay?: string;
}) {
  return (
    <div
      className="history-detail-row-enter flex min-w-0 items-start gap-2 rounded-xl border border-[#dbe6f7] bg-white p-3 shadow-sm"
      style={{ animationDelay: delay }}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
      >
        <Icon size={20} strokeWidth={2.2} />
      </div>

      <div className="min-w-0">
        <p className="text-[11px] text-slate-500">{label}</p>
        <p className="text-[15px] font-bold leading-5 text-[#111]">{value}</p>
        <p className="mt-0.5 text-[10px] leading-3 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

function PhotoCard({
  subtitle,
  imageUrl,
  isAvailable,
}: {
  subtitle: string;
  imageUrl: string;
  isAvailable: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#dbe6f7] bg-white p-3">
      <p className="text-xs text-slate-500">{subtitle}</p>

      {isAvailable ? (
        <a
          href={imageUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block overflow-hidden rounded-lg bg-[#e4e7ec]"
        >
          <img
            src={imageUrl}
            alt={subtitle}
            className="history-detail-image-enter h-32 w-full object-cover md:h-48"
          />
        </a>
      ) : (
        <div className="mt-2 flex h-32 flex-col items-center justify-center rounded-lg bg-[#e4e7ec] text-slate-400 md:h-48">
          <ImageIcon size={26} strokeWidth={2} />
          <p className="mt-1 text-[11px]">Foto belum tersedia</p>
        </div>
      )}
    </div>
  );
}

function LocationCard({
  title,
  badge,
  location,
}: {
  title: string;
  badge: string;
  location: LocationValue;
}) {
  const latitude = getLocationCoordinate(location, "lat");
  const longitude = getLocationCoordinate(location, "lng");
  const withinRadius = getLocationWithinRadius(location);
  const locationText = formatLocationText(location);
  const hasCoordinate = latitude !== null && longitude !== null;

  const mapsUrl = hasCoordinate
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : "#";

  return (
    <div className="min-w-0 rounded-xl border border-[#dbe6f7] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-4 text-slate-500">{title}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${
            hasCoordinate ? "bg-[#2870ea]" : "bg-slate-400"
          }`}
        >
          {badge}
        </span>
      </div>

      {hasCoordinate ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-lg font-bold text-[#2870ea]"
        >
          Lihat Lokasi
        </a>
      ) : (
        <p className="mt-2 text-lg font-bold text-slate-400">Lihat Lokasi</p>
      )}

      {locationText ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
          {locationText}
        </p>
      ) : null}

      {withinRadius !== null ? (
        <p
          className={`mt-1 text-[11px] font-medium ${
            withinRadius ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {withinRadius ? "Dalam radius" : "Di luar radius"}
        </p>
      ) : null}
    </div>
  );
}

function NoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#dbe6f7] bg-white px-3 py-2.5 text-[13px] leading-5 text-slate-600">
      {label} : {value}
    </div>
  );
}


function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="history-detail-enter h-44 animate-pulse rounded-[2rem] bg-white shadow-lg shadow-slate-200/60" />

      <div className="grid gap-5 lg:grid-cols-3">
        <div
          className="history-detail-row-enter h-28 animate-pulse rounded-3xl bg-white shadow-lg shadow-slate-200/60"
          style={{ animationDelay: "60ms" }}
        />
        <div
          className="history-detail-row-enter h-28 animate-pulse rounded-3xl bg-white shadow-lg shadow-slate-200/60"
          style={{ animationDelay: "100ms" }}
        />
        <div
          className="history-detail-row-enter h-28 animate-pulse rounded-3xl bg-white shadow-lg shadow-slate-200/60"
          style={{ animationDelay: "140ms" }}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div
          className="history-detail-row-enter h-96 animate-pulse rounded-[2rem] bg-white shadow-lg shadow-slate-200/60"
          style={{ animationDelay: "180ms" }}
        />
        <div
          className="history-detail-row-enter h-96 animate-pulse rounded-[2rem] bg-white shadow-lg shadow-slate-200/60"
          style={{ animationDelay: "220ms" }}
        />
      </div>
    </div>
  );
}

export default function HistoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || "");

  const [attendance, setAttendance] = useState<AttendanceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function getDetail() {
      try {
        setIsLoading(true);

        const response = await fetch(`/api/attendance/${id}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          setAttendance(null);
          return;
        }

        const data = (await response.json()) as AttendanceDetail;
        setAttendance(data);
      } catch (error) {
        console.error("Gagal mengambil detail presensi:", error);
        setAttendance(null);
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      void getDetail();
    }
  }, [id]);

  return (
    <MobileShell variant="employee">
      <HistoryDetailMotionStyles />

      <div className="min-h-dvh bg-[#f4f8ff]">
        <div className="hidden md:block">
          <AppHeader title="Detail Presensi" rightLabel="Detail" />
        </div>

        <section className="mx-auto max-w-3xl space-y-4 px-5 pb-32 pt-6 md:px-8">
          <FigmaHeader
            title="Detail Presensi"
            onBack={() => router.push("/history")}
          />

          {isLoading ? (
            <LoadingSkeleton />
          ) : !attendance ? (
            <div className="history-detail-enter rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
              <div className="history-detail-icon-pop mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50 text-red-600">
                <AlertCircle size={32} strokeWidth={2.5} />
              </div>

              <h2 className="mt-5 text-xl font-bold text-slate-950">
                Data presensi tidak ditemukan
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Data presensi ini tidak tersedia, sudah dihapus, atau tidak
                sesuai dengan akun yang sedang login.
              </p>

              <Link
                href="/history"
                className="mt-6 inline-flex rounded-xl bg-gradient-to-br from-[#2a6df0] to-[#0d3ea6] px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
              >
                Kembali ke Riwayat
              </Link>
            </div>
          ) : (
            <>
              <div className="history-detail-enter rounded-2xl bg-gradient-to-br from-[#2a6df0] to-[#0d3ea6] p-5 text-white shadow-xl shadow-[#0d3ea6]/30">
                <h2 className="text-xl font-bold capitalize leading-7">
                  {attendance.date}
                </h2>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs">
                    {attendance.status}
                  </span>
                  {attendance.checkInWorkModeLabel ? (
                    <span className="rounded-full bg-white/20 px-3 py-1 text-xs">
                      {attendance.checkInWorkModeLabel}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-2 divide-x divide-white/25 rounded-lg border border-white/25 bg-[#0a2f8f]/40 py-4">
                  <div className="px-4">
                    <p className="text-xs text-white/85">
                      CHECK-IN ({attendance.checkInWorkModeLabel || "Kantor"})
                    </p>
                    <p className="mt-1 text-3xl font-semibold leading-9">
                      {formatClock(attendance.checkIn)}
                      <span className="ml-1.5 text-sm font-semibold">WIB</span>
                    </p>
                  </div>

                  <div className="px-4">
                    <p className="text-xs text-white/85">
                      CHECK-OUT ({attendance.checkOutWorkModeLabel || "-"})
                    </p>
                    <p className="mt-1 text-3xl font-semibold leading-9">
                      {formatClock(attendance.checkOut)}
                      <span className="ml-1.5 text-sm font-semibold">WIB</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <MetricCard
                  label="Waktu Kerja"
                  value={formatMinuteLabel(attendance.workMinutes)}
                  description={
                    attendance.checkOut === "--:--"
                      ? "Belum dihitung karena belum checkout"
                      : "Durasi kerja hari ini"
                  }
                  icon={Clock3}
                  iconClass="bg-[#6c9cf2] text-white"
                  delay="60ms"
                />

                <MetricCard
                  label="Terlambat"
                  value={formatMinuteLabel(attendance.lateMinutes)}
                  description="Keterlambatan check-in"
                  icon={AlertCircle}
                  iconClass="bg-[#f4a3a3] text-[#d40000]"
                  delay="100ms"
                />

                <MetricCard
                  label="Pulang Cepat"
                  value={formatMinuteLabel(attendance.earlyLeaveMinutes)}
                  description="Pulang lebih cepat"
                  icon={Clock3}
                  iconClass="bg-[#bdbdbd] text-[#222]"
                  delay="140ms"
                />
              </div>

              <SectionCard
                icon={FileText}
                eyebrow="Keterangan Karyawan"
                title="Catatan Presensi"
                delay="160ms"
              >
                {hasText(attendance.lateReason) ||
                shouldShowVisitNote(attendance) ? (
                  <div className="space-y-3">
                    {hasText(attendance.lateReason) ? (
                      <NoteRow
                        label="Keterangan Terlambat"
                        value={String(attendance.lateReason)}
                      />
                    ) : null}

                    {shouldShowVisitNote(attendance) ? (
                      <div className="rounded-xl border border-[#dbe6f7] bg-[#f1f6fe] p-3">
                        <p className="mb-2 text-sm font-medium text-[#e5710a]">
                          Keterangan Kunjungan
                        </p>

                        <div className="space-y-2">
                          <NoteRow
                            label="Nama PT / Tujuan"
                            value={
                              getVisitTitle(attendance) || "Belum diisi"
                            }
                          />
                          <NoteRow
                            label="PIC / Client"
                            value={
                              getVisitClientName(attendance) || "Belum diisi"
                            }
                          />
                          <NoteRow
                            label="Alamat"
                            value={
                              getVisitAddress(attendance) || "Belum diisi"
                            }
                          />
                          {hasText(getVisitNote(attendance)) ? (
                            <NoteRow
                              label="Catatan"
                              value={String(getVisitNote(attendance))}
                            />
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-lg border border-[#dbe6f7] bg-white px-3 py-2.5 text-[13px] text-slate-400">
                    Tidak ada catatan presensi.
                  </p>
                )}
              </SectionCard>

              <SectionCard
                icon={Camera}
                eyebrow="Foto Check-in/Check-out"
                title="Dokumentasi"
                delay="200ms"
              >
                <div className="grid grid-cols-2 gap-3">
                  <PhotoCard
                    subtitle="Foto Presensi masuk"
                    imageUrl={`/api/attendance/${attendance.id}/photo?type=check-in`}
                    isAvailable={attendance.hasCheckInPhoto}
                  />

                  <PhotoCard
                    subtitle="Foto Presensi Pulang"
                    imageUrl={`/api/attendance/${attendance.id}/photo?type=check-out`}
                    isAvailable={attendance.hasCheckOutPhoto}
                  />
                </div>
              </SectionCard>

              <SectionCard
                icon={MapPin}
                eyebrow="Lokasi Check-in/Check-out"
                title="GPS"
                delay="240ms"
              >
                <div className="grid grid-cols-2 gap-3">
                  <LocationCard
                    title="Lokasi Presensi Masuk"
                    badge={attendance.checkInWorkModeLabel || "-//-"}
                    location={attendance.checkInLocation}
                  />

                  <LocationCard
                    title="Lokasi Presensi Pulang"
                    badge={attendance.checkOutWorkModeLabel || "-//-"}
                    location={attendance.checkOutLocation}
                  />
                </div>
              </SectionCard>
            </>
          )}
        </section>
      </div>

      <BottomNav />
    </MobileShell>
  );
}
