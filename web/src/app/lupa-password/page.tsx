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
} from "@/components/auth/AuthUI";

const EMAIL_DOMAIN = "@creativemu.id";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LupaPasswordPage() {
  const [email, setEmail] = useState("");
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

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError("Masukkan email dengan format yang benar.");
      return;
    }

    try {
      setIsLoading(true);

      // TODO: endpoint ini belum ada di backend
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        setError(
          "Reset password belum tersedia. Hubungi admin untuk reset password.",
        );
        return;
      }

      setSuccess("Link reset password sudah dikirim ke email Anda.");
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell>
      <AuthFormColumn>
        <AuthHeading
          title="Lupa Password?"
          subtitle="Masukkan email Anda untuk reset password"
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
              "Kirim Link Reset"
            )}
          </AuthButton>

          <p className="text-center text-xs lg:text-base">
            <Link
              href="/login"
              className="font-medium text-[#485dfe] hover:underline"
            >
              Kembali ke Sign In
            </Link>
          </p>
        </form>
      </AuthFormColumn>
    </AuthShell>
  );
}
