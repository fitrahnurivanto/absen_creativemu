export function getApiErrorStatus(error: unknown) {
  if (!(error instanceof Error)) return 500;

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (message.includes("akses")) return 403;

  if (
    message.includes("token login") ||
    message.includes("user id tidak ditemukan di token") ||
    name.includes("jwt") ||
    name.includes("jws") ||
    name.includes("jose")
  ) {
    return 401;
  }

  return 500;
}

function getErrorText(error: unknown) {
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "Terjadi kesalahan server.",
) {
  const status = getApiErrorStatus(error);

  if (status === 401) return "Silakan login terlebih dahulu.";
  if (status === 403) return "Akses ditolak.";

  if (error instanceof Error) {
    const message = getErrorText(error).toLowerCase();

    if (message.includes("wfh_quota_monthly")) {
      return fallback;
    }

    if (message.includes("konfigurasi upload")) {
      return "Konfigurasi upload file di hosting belum lengkap.";
    }

    if (
      message.includes("unknown column") ||
      message.includes("doesn't exist") ||
      message.includes("table") ||
      message.includes("prisma") ||
      message.includes("foreign key")
    ) {
      return "Struktur database hosting belum sesuai versi aplikasi. Jalankan migration terbaru lalu coba lagi.";
    }
  }

  return fallback;
}
