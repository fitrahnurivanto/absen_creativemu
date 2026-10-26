"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

const fieldBase =
  "w-full rounded-md border border-[#6f6a8a] bg-gradient-to-b from-white to-[#f6f6fa] px-3.5 text-[13px] text-black shadow-[0_3px_5px_rgba(60,50,100,0.28)] outline-none transition placeholder:text-[#b4b4bd] focus:border-[#3228da] focus:ring-2 focus:ring-[#3228da]/25 disabled:cursor-not-allowed disabled:opacity-60 h-[45px] lg:h-16 lg:rounded-lg lg:px-5 lg:text-base";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
};

export function AuthField({ label, id, ...props }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div className="w-full">
      <label
        htmlFor={fieldId}
        className="mb-1.5 block pl-2 text-xs lg:mb-2 lg:pl-3 lg:text-[15px]"
      >
        {label}
      </label>
      <input id={fieldId} className={fieldBase} {...props} />
    </div>
  );
}

export function AuthPasswordField({ label, id, ...props }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="w-full">
      <label
        htmlFor={fieldId}
        className="mb-1.5 block pl-2 text-xs lg:mb-2 lg:pl-3 lg:text-[15px]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          type={visible ? "text" : "password"}
          className={`${fieldBase} pr-12`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[#8a88a0] transition hover:text-[#3228da]"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export function AuthButton({
  children,
  disabled,
  type = "submit",
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className="flex h-[45px] w-full items-center justify-center gap-2 rounded-md border border-[#6b6f95] bg-[linear-gradient(105deg,#276de7_0%,#1c5bd2_45%,#1346b2_100%)] text-sm font-medium text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 lg:h-16 lg:rounded-lg lg:text-lg"
    >
      {children}
    </button>
  );
}

export function AuthMessage({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: ReactNode;
}) {
  const tone =
    kind === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`w-full rounded-md border px-3 py-2 text-xs lg:text-sm ${tone}`}
    >
      {children}
    </p>
  );
}

/** Kolom form: lebar mengikuti Figma (mobile ±68%, desktop ±424px) */
export function AuthFormColumn({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-[min(68vw,380px)] min-w-[262px] flex-col items-stretch lg:w-[424px] lg:min-w-0 lg:max-w-[88%]">
      {children}
    </div>
  );
}

export function AuthHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mt-[8dvh] text-center lg:mt-16">
      <h1 className="text-[26px] font-bold leading-tight lg:text-[28px]">
        {title}
      </h1>
      <p className="mt-1.5 text-xs lg:mt-2 lg:text-[17px]">{subtitle}</p>
    </div>
  );
}
