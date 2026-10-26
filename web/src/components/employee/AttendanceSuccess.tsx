import { Check } from "lucide-react";
import { inter } from "@/lib/inter-font";
import { GradientLink, OutlineLink } from "./EmployeeUI";

export type AttendanceSuccessInfo = {
  action: "check-in" | "check-out";
  dateLabel: string;
  timeLabel: string;
  locationLabel: string;
  statusLabel: string;
};

export default function AttendanceSuccess({
  info,
}: {
  info: AttendanceSuccessInfo;
}) {
  const rows = [
    { label: "Tanggal", value: info.dateLabel },
    { label: "Jam", value: info.timeLabel },
    { label: "Lokasi", value: info.locationLabel },
    { label: "Status", value: info.statusLabel, highlight: true },
  ];

  return (
    <div
      className={`${inter.className} min-h-dvh bg-[#f4f8ff] px-8 pb-10 pt-[18dvh] text-black`}
    >
      <div className="mx-auto w-full max-w-[420px]">
        <div className="mx-auto flex h-[54px] w-[54px] items-center justify-center rounded-full bg-[#bdefbd]">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#a6e3a6]">
            <Check size={22} strokeWidth={2.8} className="text-[#1d1d1f]" />
          </span>
        </div>

        <h1 className="mt-[8dvh] text-center text-[30px] font-bold leading-tight">
          {info.action === "check-in"
            ? "Presensi Berhasil"
            : "Presensi Pulang Berhasil"}
        </h1>

        <dl className="mt-8 rounded-xl bg-white px-4 py-1.5">
          {rows.map((row, index) => (
            <div
              key={row.label}
              className={`flex items-center justify-between gap-4 px-2 py-5 ${
                index < rows.length - 1 ? "border-b border-[#6b6b6b]/70" : ""
              }`}
            >
              <dt className="text-[15px] text-[#6b6b6b]">{row.label}</dt>
              <dd
                className={`text-right text-[15px] font-semibold ${
                  row.highlight ? "text-[#2468e4]" : ""
                }`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 space-y-4">
          <GradientLink href="/beranda" tall>
            Kembali ke Beranda
          </GradientLink>
          <OutlineLink href="/history" tall>
            Lihat Riwayat
          </OutlineLink>
        </div>
      </div>
    </div>
  );
}
