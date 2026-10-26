"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Warna sengaja pakai hex yang tidak ditimpa globals.css (tema admin).
export const figmaLabel = "mb-2 block text-[15px] font-semibold text-[#111]";
export const figmaLabelSoft = "mb-1.5 block text-[15px] text-[#555]";

const figmaFieldBase =
  "w-full rounded-xl border border-[#dde5f2] px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#0559e0] focus:ring-4 focus:ring-[#0559e0]/15";

export const figmaInput = `h-[52px] bg-white ${figmaFieldBase}`;
export const figmaTextarea = `min-h-[120px] resize-none bg-white py-3 ${figmaFieldBase}`;

// Varian abu-abu muda (halaman Izin)
export const figmaInputSoft = `h-[52px] bg-[#f5f7fb] ${figmaFieldBase}`;
export const figmaTextareaSoft = `min-h-[120px] resize-none bg-[#f5f7fb] py-3 ${figmaFieldBase}`;

export const figmaGradient =
  "bg-gradient-to-br from-[#2a6df0] to-[#0d3ea6] text-white shadow-lg shadow-[#0d3ea6]/30";

export const figmaButton = `flex h-[58px] w-full items-center justify-center gap-2 rounded-xl text-lg font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${figmaGradient}`;

type FigmaHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  className?: string;
};

export function FigmaHeader({
  title,
  subtitle,
  onBack,
  right,
  className = "",
}: FigmaHeaderProps) {
  const router = useRouter();

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <button
        type="button"
        onClick={onBack ?? (() => router.back())}
        aria-label="Kembali"
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#222] transition active:scale-95"
      >
        <ArrowLeft size={24} strokeWidth={2.4} />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-semibold leading-7 text-[#111]">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-[15px] leading-5 text-slate-500">{subtitle}</p>
        ) : null}
      </div>

      {right ? <div className="shrink-0 pt-1">{right}</div> : null}
    </div>
  );
}
