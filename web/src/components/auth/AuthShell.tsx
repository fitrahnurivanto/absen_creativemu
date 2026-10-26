import Image from "next/image";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import AuthClock from "./AuthClock";
import AuthWaves from "./AuthWaves";

const inter = Inter({ subsets: ["latin"], display: "swap" });

type AuthShellProps = {
  children: ReactNode;
  /** true saat splash tampil (hanya mobile) */
  splash?: boolean;
  /** isi lebih panjang (register): logo & jarak atas dirapatkan */
  compact?: boolean;
};

export default function AuthShell({
  children,
  splash = false,
  compact = false,
}: AuthShellProps) {
  return (
    <div
      className={`${inter.className} relative min-h-dvh w-full overflow-hidden bg-white text-black lg:grid lg:grid-cols-2 lg:bg-[#f4f8ff]`}
    >
      {/* Desktop: foto + jam */}
      <aside className="relative hidden min-h-dvh lg:block">
        <Image
          src="/images/auth/team.jpg"
          alt=""
          fill
          priority
          unoptimized
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-black via-black/70 to-transparent" />
        <div className="absolute bottom-10 left-12">
          <AuthClock />
        </div>
      </aside>

      <main className="relative flex min-h-dvh flex-col items-center lg:justify-center lg:bg-[#f4f8ff]">
        {/* Mobile: ombak */}
        <div className="lg:hidden">
          <AuthWaves lowered={splash} />
        </div>

        {/* Mobile: logo splash di tengah */}
        <div
          className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-500 motion-reduce:transition-none lg:hidden ${
            splash ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src="/images/creativemu-logo/logo-solo.png"
            alt="Creativemu"
            width={570}
            height={488}
            priority
            unoptimized
            className="h-auto w-14 animate-pulse motion-reduce:animate-none"
          />
        </div>

        <div
          className={`relative z-10 flex w-full flex-1 flex-col items-center pb-[26dvh] transition-opacity duration-500 motion-reduce:transition-none lg:flex-none lg:pb-0 lg:opacity-100 ${
            compact ? "pt-[7dvh]" : "pt-[18dvh]"
          } lg:pt-0 ${splash ? "pointer-events-none opacity-0 lg:pointer-events-auto" : "opacity-100"}`}
        >
          <Image
            src="/images/creativemu-logo/logo-full.png"
            alt="Creativemu"
            width={1400}
            height={331}
            priority
            unoptimized
            className={`h-auto ${
              compact ? "w-[min(60vw,240px)]" : "w-[min(72vw,300px)]"
            } lg:w-[440px] lg:max-w-[80%]`}
          />
          {children}
        </div>
      </main>
    </div>
  );
}
