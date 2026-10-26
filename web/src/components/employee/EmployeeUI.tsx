import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const gradientBg =
  "bg-[linear-gradient(105deg,#2a72ec_0%,#1b58d0_50%,#0f3ea6_100%)]";

const base =
  "flex w-full items-center justify-center rounded-[10px] text-[17px] font-bold transition active:scale-[0.99] disabled:cursor-not-allowed";

const solid = `${base} ${gradientBg} text-white shadow-[0_4px_8px_rgba(15,62,166,0.3)] hover:brightness-110 disabled:bg-[#8e8e93] disabled:bg-none disabled:text-[#636366] disabled:shadow-none`;

const outline = `${base} border-2 border-[#2468e4] bg-transparent text-[#2468e4] shadow-[0_3px_6px_rgba(36,104,228,0.2)] hover:bg-white disabled:opacity-60`;

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  tall?: boolean;
};

export function GradientButton({ tall, ...props }: ButtonProps) {
  return <button {...props} className={`${solid} ${tall ? "h-14" : "h-12"}`} />;
}

export function OutlineButton({ tall, ...props }: ButtonProps) {
  return <button {...props} className={`${outline} ${tall ? "h-14" : "h-12"}`} />;
}

export function GradientLink({
  href,
  children,
  disabled,
  tall,
}: {
  href: string;
  children: ReactNode;
  disabled?: boolean;
  tall?: boolean;
}) {
  const size = tall ? "h-14" : "h-12";

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${base} ${size} bg-[#8e8e93] text-[#636366]`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`${base} ${size} ${gradientBg} text-white shadow-[0_4px_8px_rgba(15,62,166,0.3)] hover:brightness-110`}
    >
      {children}
    </Link>
  );
}

export function OutlineLink({
  href,
  children,
  tall,
}: {
  href: string;
  children: ReactNode;
  tall?: boolean;
}) {
  return (
    <Link href={href} className={`${outline} ${tall ? "h-14" : "h-12"}`}>
      {children}
    </Link>
  );
}
