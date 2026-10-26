"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, History, Home, UserRound, type LucideIcon } from "lucide-react";

type BottomNavProps = {
  variant?: "employee" | "admin";
};

type MenuItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** path lain yang dianggap bagian dari menu ini */
  also?: string[];
};

const menus: MenuItem[] = [
  {
    href: "/beranda",
    label: "Beranda",
    icon: Home,
    also: ["/", "/presensi", "/tukar-shift", "/pengumuman", "/notifikasi"],
  },
  { href: "/cuti", label: "Izin", icon: FileText },
  { href: "/history", label: "Riwayat", icon: History },
  { href: "/profil", label: "Profil", icon: UserRound, also: ["/kartu-identitas"] },
];

function matches(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isActive(pathname: string, item: MenuItem) {
  return [item.href, ...(item.also ?? [])].some((href) =>
    matches(pathname, href),
  );
}

export default function BottomNav({ variant = "employee" }: BottomNavProps) {
  const pathname = usePathname();

  if (variant === "admin") return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="h-[calc(5.75rem+env(safe-area-inset-bottom))] shrink-0 md:hidden"
      />

      <nav
        aria-label="Menu utama"
        className="fixed inset-x-0 bottom-0 z-50 md:hidden"
      >
        <div className="mx-auto w-full max-w-[32rem] rounded-t-[1.75rem] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(36,70,150,0.10)]">
          <div className="grid grid-cols-4">
            {menus.map((menu) => {
              const active = isActive(pathname, menu);
              const Icon = menu.icon;

              return (
                <Link
                  key={menu.href}
                  href={menu.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-1 pb-3 pt-4 text-[12px] font-semibold transition active:scale-95 ${
                    active ? "text-[#2468e4]" : "text-black"
                  }`}
                >
                  <Icon size={26} strokeWidth={active ? 2.3 : 2} />
                  <span className="leading-none">{menu.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
