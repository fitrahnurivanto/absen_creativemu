"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import AuthShell from "@/components/auth/AuthShell";
import {
  AuthButton,
  AuthField,
  AuthFormColumn,
  AuthHeading,
  AuthMessage,
  AuthPasswordField,
} from "@/components/auth/AuthUI";

type LoginResponse = {
  message?: string;
  redirectTo?: string;
  retryAfterSeconds?: number;
};

const EMAIL_DOMAIN = "@creativemu.id";
const REMEMBER_KEY = "cm_remember_email";
const SPLASH_KEY = "cm_splash_seen";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.includes("@") ? trimmed : `${trimmed}${EMAIL_DOMAIN}`;
}

async function readJson(response: Response): Promise<LoginResponse> {
  try {
    return (await response.json()) as LoginResponse;
  } catch {
    return {};
  }
}

export default function LoginPage() {
  const router = useRouter();

  const [splash, setSplash] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // Splash (sekali per sesi) + email yang diingat
  useEffect(() => {
    let seen = false;
    let savedEmail = "";

    try {
      seen = sessionStorage.getItem(SPLASH_KEY) === "1";
      savedEmail = localStorage.getItem(REMEMBER_KEY) ?? "";
    } catch {
      // storage tidak tersedia
    }

    const timer = window.setTimeout(
      () => {
        setSplash(false);
        try {
          sessionStorage.setItem(SPLASH_KEY, "1");
        } catch {
          // abaikan
        }
      },
      seen ? 0 : 1800,
    );

    const restore = window.setTimeout(() => {
      if (savedEmail) {
        setEmail(savedEmail);
        setRemember(true);
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(restore);
    };
  }, []);

  // Hitung mundur saat kena rate limit
  useEffect(() => {
    if (!retryUntil) return;

    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryUntil) setRetryUntil(null);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [retryUntil]);

  const retrySeconds = retryUntil
    ? Math.max(0, Math.ceil((retryUntil - now) / 1000))
    : 0;
  const busy = isLoading || retrySeconds > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError("");
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password.trim()) {
      setError("Email dan password wajib diisi.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError("Format email salah. Contoh: nama@email.com");
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const result = await readJson(response);

      if (!response.ok) {
        if (response.status === 429) {
          const header = Number(response.headers.get("Retry-After"));
          const seconds = result.retryAfterSeconds || header || 60;
          const current = Date.now();
          setNow(current);
          setRetryUntil(current + seconds * 1000);
          setError(`Terlalu banyak percobaan. Tunggu ${seconds} detik.`);
          return;
        }

        setError(result.message || "Masuk gagal.");
        return;
      }

      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, normalizedEmail);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        // abaikan
      }

      router.replace(result.redirectTo || "/beranda");
      router.refresh();
    } catch (err) {
      console.error("LOGIN_ERROR:", err);
      setError(
        err instanceof Error ? err.message : "Terjadi kesalahan saat login.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell splash={splash}>
      <AuthFormColumn>
        <AuthHeading
          title="Selamat Datang"
          subtitle="Login untuk melanjutkan"
        />

        <form
          noValidate
          onSubmit={handleSubmit}
          className="mt-[4dvh] flex flex-col gap-4 lg:mt-12 lg:gap-6"
        >
          <AuthField
            label="Email Address"
            type="text"
            inputMode="email"
            autoComplete="username"
            placeholder="nama@gmail.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />

          <AuthPasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="Masukkan password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />

          <div className="flex items-center justify-between gap-2 text-xs lg:text-base">
            <label className="flex cursor-pointer items-center gap-2 lg:gap-3">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-4 w-4 rounded border-[#ddd] accent-[#3228da] lg:h-6 lg:w-6"
              />
              Remember me
            </label>

            <Link
              href="/lupa-password"
              className="font-medium text-[#485dfe] hover:underline"
            >
              Lupa Password
            </Link>
          </div>

          {error ? <AuthMessage kind="error">{error}</AuthMessage> : null}

          <AuthButton disabled={busy}>
            {retrySeconds > 0 ? (
              `Tunggu ${retrySeconds} detik`
            ) : isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Memproses...
              </>
            ) : (
              "Sign In"
            )}
          </AuthButton>

          <p className="text-center text-xs lg:text-base">
            Belum punya akun?{" "}
            <Link
              href="/register"
              className="font-medium text-[#485dfe] hover:underline"
            >
              Daftar
            </Link>
          </p>
        </form>
      </AuthFormColumn>
    </AuthShell>
  );
}
