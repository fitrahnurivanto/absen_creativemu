"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CreditCard,
  Download,
  IdCard,
  Loader2,
  Mail,
  MapPin,
  Network,
  Phone,
  QrCode,
  ShieldCheck,
} from "lucide-react";

import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import MobileShell from "@/components/MobileShell";
import { FigmaHeader } from "@/components/ui/FigmaUI";
import { useSiteLogoSettings } from "@/hooks/useSiteLogo";
import { getBankOption } from "@/lib/bank-options";

type UserRelation = {
  id: string;
  name: string;
} | null;

type KartuIdentitasUser = {
  id: string;
  employee_code?: string | null;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  status: string;
  profile_photo: string | null;
  nik?: string | null;
  bank_code?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  employment_start_date?: string | null;
  employment_end_date?: string | null;
  employment_status?: string | null;
  department?: UserRelation;
  position?: UserRelation;
  jabatan?: UserRelation;
  registered_office?: { name?: string; address?: string } | null;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0])
    .join("")
    .toUpperCase();
}

function formatRole(role: string) {
  const roleMap: Record<string, string> = {
    owner: "Pemilik",
    admin: "Admin",
    cs: "CS",
    employee: "Karyawan",
    OWNER: "Pemilik",
    ADMIN: "Admin",
    CS: "CS",
    EMPLOYEE: "Karyawan",
  };

  return roleMap[role] || role;
}

function formatStatus(status: string) {
  const statusMap: Record<string, string> = {
    active: "Aktif",
    inactive: "Nonaktif",
    ACTIVE: "Aktif",
    INACTIVE: "Nonaktif",
  };

  return statusMap[status] || status;
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatEmploymentPeriod(user: KartuIdentitasUser) {
  const startDate = formatDate(user.employment_start_date);
  const endDate = formatDate(user.employment_end_date);

  if (startDate === "-" && endDate === "-") return "-";
  if (startDate === "-") return `s/d ${endDate}`;
  if (endDate === "-") return `Mulai ${startDate}`;

  return `${startDate} - ${endDate}`;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Response API bukan JSON.");
  }
}

function KartuIdentitasMotionStyles() {
  return (
    <style>{`
      @keyframes kartuIdentitasEnter {
        0% {
          opacity: 0;
          transform: translateY(8px);
        }

        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .kartu-identitas-enter {
        animation: kartuIdentitasEnter 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      @media (prefers-reduced-motion: reduce) {
        .kartu-identitas-enter {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
      }
    `}</style>
  );
}

export default function KartuIdentitasPage() {
  const router = useRouter();
  const { logoSrc, siteTitle } = useSiteLogoSettings();
  const cardRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<KartuIdentitasUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeSide, setActiveSide] = useState<"front" | "back">("front");
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        setErrorMessage("");

        const response = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
        });

        const data = await readJsonResponse(response);

        if (response.status === 401) {
          router.push("/login");
          return;
        }

        if (!response.ok) {
          throw new Error(
            data.error || data.message || "Gagal mengambil data user.",
          );
        }

        setUser(data.user);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Gagal mengambil data user.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, []);

  const initials = user?.name ? getInitials(user.name) : "";

  // 1. FRONT SIDE (Public Office Data)
  const frontOfficeDetails = useMemo(() => {
    if (!user) return [];

    return [
      {
        label: "No Induk Karyawan",
        value: user.employee_code || "-",
        icon: IdCard,
      },
      {
        label: "Status Kepegawaian",
        value: user.employment_status || "Karyawan Tetap",
        icon: BadgeCheck,
      },
      {
        label: "Divisi",
        value: user.department?.name || "-",
        icon: Network,
      },
      {
        label: "Jabatan",
        value: user.jabatan?.name || "-",
        icon: BriefcaseBusiness,
      },
      {
        label: "Posisi",
        value: user.position?.name || "-",
        icon: BriefcaseBusiness,
      },
      {
        label: "Status Akun",
        value: formatStatus(user.status),
        icon: ShieldCheck,
      },
      {
        label: "Masa Kerja",
        value: formatEmploymentPeriod(user),
        icon: CalendarDays,
      },
      {
        label: "Kantor Terdaftar",
        value: user.registered_office?.name || "Kantor Pusat",
        icon: MapPin,
      },
    ];
  }, [user]);

  // 2. BACK SIDE (Personal & Bank Data)
  const backSensitiveDetails = useMemo(() => {
    if (!user) return [];

    return [
      {
        label: "NIK",
        value: user.nik || "-",
        icon: IdCard,
      },
      {
        label: "Email",
        value: user.email,
        icon: Mail,
      },
      {
        label: "Nomor Telepon",
        value: user.phone || "-",
        icon: Phone,
      },
      {
        label: "Bank",
        value: getBankOption(user.bank_code)?.name || user.bank_name || "-",
        icon: Building2,
      },
      {
        label: "No Rekening",
        value: user.bank_account_number || "-",
        icon: CreditCard,
      },
      {
        label: "Status Akun",
        value: formatStatus(user.status),
        icon: ShieldCheck,
      },
    ];
  }, [user]);

  async function handleDownloadPNG() {
    if (!user) return;
    try {
      setIsDownloading(true);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = 1200;
      const height = 1350;
      canvas.width = width;
      canvas.height = height;

      // Draw FRONT CARD (0 to 630)
      ctx.fillStyle = "#123c8c";
      ctx.fillRect(0, 0, 360, 630);
      ctx.fillStyle = "#f8fbff";
      ctx.fillRect(360, 0, width - 360, 630);

      // Front Left Photo
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PRESENSI", 180, 55);

      const photoSize = 180;
      const photoX = (360 - photoSize) / 2;
      const photoY = 85;

      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(photoX, photoY, photoSize, photoSize + 36, 20);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (user.profile_photo) {
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = user.profile_photo!;
          });
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(photoX + 5, photoY + 5, photoSize - 10, photoSize + 26, 16);
          ctx.clip();
          ctx.drawImage(img, photoX + 5, photoY + 5, photoSize - 10, photoSize + 26);
          ctx.restore();
        } catch {
          ctx.fillStyle = "#123c8c";
          ctx.font = "bold 52px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(initials, 180, photoY + (photoSize + 36) / 2);
        }
      } else {
        ctx.fillStyle = "#123c8c";
        ctx.font = "bold 52px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initials, 180, photoY + (photoSize + 36) / 2);
      }

      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(user.name, 180, 375);

      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.roundRect(80, 405, 200, 40, 20);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "600 16px sans-serif";
      ctx.fillText(formatRole(user.role).toUpperCase(), 180, 431);

      // Front Right Grid
      ctx.fillStyle = "#123c8c";
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("KARTU KARYAWAN", 410, 50);

      ctx.fillStyle = "#123456";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText("Identitas Pegawai (Tampak Depan)", 410, 92);

      ctx.strokeStyle = "rgba(18, 60, 140, 0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(410, 110);
      ctx.lineTo(width - 40, 110);
      ctx.stroke();

      const col1X = 410;
      const col2X = 800;
      const startY = 160;

      frontOfficeDetails.forEach((item, i) => {
        const isCol2 = i % 2 === 1;
        const curX = isCol2 ? col2X : col1X;
        const curY = startY + Math.floor(i / 2) * 95;

        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 13px sans-serif";
        ctx.fillText(item.label.toUpperCase(), curX, curY);

        ctx.fillStyle = "#123456";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText(String(item.value), curX, curY + 26);
      });

      // Divider Line between Front and Back (630 to 720)
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(0, 630, width, 90);

      ctx.fillStyle = "#64748b";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("--- SISI BELAKANG (DETAIL PERSONAL & BANK) ---", width / 2, 683);

      // Draw BACK CARD (720 to 1350)
      ctx.fillStyle = "#123c8c";
      ctx.fillRect(0, 720, 360, 630);
      ctx.fillStyle = "#f8fbff";
      ctx.fillRect(360, 720, width - 360, 630);

      // Back Left QR
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("VERIFIKASI", 180, 775);

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(photoX, 805, photoSize, photoSize + 20, 20);
      ctx.fill();

      ctx.fillStyle = "#123c8c";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("QR CODE", 180, 915);

      ctx.fillStyle = "#ffffff";
      ctx.font = "italic 15px sans-serif";
      ctx.fillText("Presensi Digital", 180, 1100);

      // Back Right Grid
      ctx.fillStyle = "#123c8c";
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("DETAIL PERSONAL", 410, 770);

      ctx.fillStyle = "#123456";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText("Detail Personal & Bank", 410, 812);

      ctx.strokeStyle = "rgba(18, 60, 140, 0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(410, 830);
      ctx.lineTo(width - 40, 830);
      ctx.stroke();

      let bStartY = 880;
      backSensitiveDetails.forEach((item, i) => {
        const isCol2 = i % 2 === 1;
        const curX = isCol2 ? col2X : col1X;
        const curY = bStartY + Math.floor(i / 2) * 105;

        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 13px sans-serif";
        ctx.fillText(item.label.toUpperCase(), curX, curY);

        ctx.fillStyle = "#123456";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText(String(item.value), curX, curY + 26);
      });

      // Download link
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `Kartu_Identitas_${user.name.replace(/\s+/g, "_")}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("DOWNLOAD_ERROR:", err);
    } finally {
      setIsDownloading(false);
    }
  }

  const sideItems =
    activeSide === "front" ? frontOfficeDetails : backSensitiveDetails;

  return (
    <MobileShell variant="employee" withBottomPadding={false}>
      <KartuIdentitasMotionStyles />

      <div className="hidden md:block">
        <AppHeader title="Kartu Identitas" variant="employee" />
      </div>

      <main className="min-h-dvh bg-[#f4f8ff] pb-32 text-slate-950">
        <section className="mx-auto max-w-3xl px-5 pt-6 md:pt-8">
          <FigmaHeader title="KTA" subtitle="kartu tanda anggota" />

          <div className="mt-7 flex rounded-xl border border-[#dde5f2] bg-white p-1">
            {(
              [
                { key: "front", label: "Sisi Depan" },
                { key: "back", label: "Sisi Belakang" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSide(tab.key)}
                className={`h-[46px] flex-1 rounded-lg text-[17px] font-medium transition ${
                  activeSide === tab.key
                    ? "bg-gradient-to-br from-[#2a6df0] to-[#0d3ea6] text-white shadow-md shadow-[#0d3ea6]/25"
                    : "text-slate-500"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-10">
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-[#dde5f2] bg-white p-5 text-sm font-medium text-slate-500">
                <Loader2 size={20} className="animate-spin text-[#0559e0]" />
                Mengambil kartu identitas...
              </div>
            ) : errorMessage || !user ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-6 text-center">
                <p className="text-xs font-bold text-red-700">
                  {errorMessage || "Kartu identitas tidak ditemukan."}
                </p>
              </div>
            ) : (
              <div
                ref={cardRef}
                className="kartu-identitas-enter mx-auto w-full max-w-[840px] overflow-hidden rounded-xl border-2 border-[#0a3a8c] bg-white shadow-xl shadow-[#0d3ea6]/15"
              >
                <div className="bg-gradient-to-r from-[#1a47b0] via-[#4b2ad6] to-[#8b00ff] px-4 py-3 text-base font-semibold text-white md:px-6 md:py-4 md:text-xl">
                  Kartu Karyawan
                </div>

                <div className="relative">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                  >
                    <div className="absolute -inset-10 grid -rotate-12 grid-cols-4 gap-x-6 gap-y-8 opacity-[0.07]">
                      {Array.from({ length: 20 }).map((_, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-900"
                        >
                          {logoSrc ? (
                            <img
                              src={logoSrc}
                              alt=""
                              className="h-6 w-6 shrink-0 object-contain"
                            />
                          ) : null}
                          <span className="truncate">{siteTitle}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative grid grid-cols-[30%_1fr] gap-3 p-3.5 md:gap-6 md:p-6">
                    <div className="flex min-w-0 flex-col items-center text-center">
                      {activeSide === "front" ? (
                        <div className="flex aspect-[5/6] w-full max-w-[150px] items-center justify-center overflow-hidden bg-[#d9d9d9] text-2xl font-semibold text-[#0a3a8c]">
                          {user.profile_photo ? (
                            <img
                              src={user.profile_photo}
                              alt={user.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            initials
                          )}
                        </div>
                      ) : (
                        <div className="flex aspect-[5/6] w-full max-w-[150px] flex-col items-center justify-center bg-white text-[#0a3a8c] ring-1 ring-[#dde5f2]">
                          <QrCode size={40} strokeWidth={2} />
                          <span className="mt-1 text-[8px] font-bold uppercase tracking-wider">
                            Verified
                          </span>
                        </div>
                      )}

                      <p className="mt-3 w-full break-words text-[12px] font-medium uppercase leading-4 text-[#1a47b0] md:text-lg md:leading-6">
                        {user.name}
                      </p>
                      <p className="w-full break-words text-[12px] font-medium leading-4 text-[#1a47b0] md:text-lg md:leading-6">
                        {user.jabatan?.name || formatRole(user.role)}
                      </p>
                    </div>

                    <div className="grid min-w-0 grid-cols-2 content-start gap-x-3 gap-y-4 md:gap-x-6 md:gap-y-6">
                      {sideItems.map((item) => (
                        <div key={item.label} className="min-w-0">
                          <p className="text-[7px] font-medium uppercase tracking-wide text-slate-600 md:text-[11px]">
                            {item.label}
                          </p>
                          <p className="mt-0.5 break-words text-[10px] font-medium leading-3 text-[#0a3a8c] md:text-sm md:leading-5">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <BottomNav />
      </main>
    </MobileShell>
  );
}
