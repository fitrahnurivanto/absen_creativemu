"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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

const EMAIL_DOMAIN = "@creativemu.id";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    setError("");
    setSuccess("");

    const trimmed = email.trim().toLowerCase();
    const normalizedEmail = trimmed.includes("@")
      ? trimmed
      : trimmed
        ? `${trimmed}${EMAIL_DOMAIN}`
        : "";

    if (!name.trim() || !normalizedEmail || !password || !confirm) {
      setError("Semua kolom wajib diisi.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError("Format email salah. Contoh: nama@email.com");
      return;
    }

    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }

    if (password !== confirm) {
      setError("Konfirmasi password tidak sama.");
      return;
    }

    try {
      setIsLoading(true);

      // TODO: endpoint ini belum ada di backend
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: normalizedEmail,
          password,
        }),
      });

      if (!response.ok) {
        let message = "";
        try {
          message = ((await response.json()) as { message?: string }).message ?? "";
        } catch {
          // abaikan
        }
        setError(
          message ||
            "Pendaftaran belum tersedia. Hubungi admin untuk dibuatkan akun.",
        );
        return;
      }

      setSuccess("Pendaftaran berhasil. Silakan Sign In.");
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell compact>
      <AuthFormColumn>
        <AuthHeading
          title="Buat Akun"
          subtitle="Daftar untuk mulai menggunakan presensi"
        />

        <form
          noValidate
          onSubmit={handleSubmit}
          className="mt-[3dvh] flex flex-col gap-3.5 lg:mt-10 lg:gap-5"
        >
          <AuthField
            label="Nama Lengkap"
            type="text"
            autoComplete="name"
            placeholder="Masukkan nama lengkap"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isLoading}
          />

          <AuthField
            label="Email Address"
            type="text"
            inputMode="email"
            autoComplete="username"
            placeholder="nama@gmail.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isLoading}
          />

          <AuthPasswordField
            label="Password"
            autoComplete="new-password"
            placeholder="Minimal 8 karakter"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isLoading}
          />

          <AuthPasswordField
            label="Konfirmasi Password"
            autoComplete="new-password"
            placeholder="Ulangi password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            disabled={isLoading}
          />

          {error ? <AuthMessage kind="error">{error}</AuthMessage> : null}
          {success ? <AuthMessage kind="success">{success}</AuthMessage> : null}

          <AuthButton disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Memproses...
              </>
            ) : (
              "Daftar"
            )}
          </AuthButton>

          <p className="text-center text-xs lg:text-base">
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="font-medium text-[#485dfe] hover:underline"
            >
              Sign In
            </Link>
          </p>
        </form>
      </AuthFormColumn>
    </AuthShell>
  );
}
