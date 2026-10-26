"use client";

import { useEffect, useMemo, useState } from "react";
import { findNearestValidOffice, type OfficeGeofence } from "@/lib/geo";

export type LiveGpsState = {
  status: "loading" | "live" | "denied" | "unavailable";
  hasPosition: boolean;
  /** jarak (meter) ke kantor aktif terdekat, null jika di luar radius */
  distance: number | null;
  officeName: string | null;
  accuracy: number | null;
};

type Position = { lat: number; lng: number; accuracy: number };

/** Memantau lokasi (watchPosition) dan mencocokkannya dengan kantor aktif. */
export function useLiveGps(enabled = true): LiveGpsState {
  const [offices, setOffices] = useState<OfficeGeofence[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<"denied" | "unavailable" | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function loadOffices() {
      try {
        const response = await fetch("/api/offices/active", {
          cache: "no-store",
        });
        const result = await response.json();

        if (!cancelled && result?.success && Array.isArray(result.offices)) {
          setOffices(result.offices);
        }
      } catch {
        // kantor gagal dimuat: jarak tidak ditampilkan
      }
    }

    void loadOffices();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const timer = window.setTimeout(() => setError("unavailable"), 0);
      return () => window.clearTimeout(timer);
    }

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        setError(null);
        setPosition({
          lat: result.coords.latitude,
          lng: result.coords.longitude,
          accuracy: result.coords.accuracy,
        });
      },
      (failure) => {
        setError(
          failure.code === failure.PERMISSION_DENIED ? "denied" : "unavailable",
        );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return useMemo<LiveGpsState>(() => {
    const matched = position
      ? findNearestValidOffice({ lat: position.lat, lng: position.lng }, offices)
      : null;

    return {
      status: position ? "live" : (error ?? "loading"),
      hasPosition: Boolean(position),
      distance: matched ? Math.round(matched.distance) : null,
      officeName: matched?.office.name ?? null,
      accuracy: position?.accuracy ?? null,
    };
  }, [position, offices, error]);
}
