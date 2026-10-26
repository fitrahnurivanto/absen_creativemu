"use client";

import { useEffect, useState } from "react";

function formatTime() {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  })
    .format(new Date())
    .replace(/\./g, ":");
}

export default function AuthClock() {
  const [time, setTime] = useState("--:--:--");

  useEffect(() => {
    const tick = () => setTime(formatTime());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <p className="flex items-end gap-3 text-white">
      <span className="text-6xl font-bold tabular-nums leading-none tracking-tight xl:text-7xl">
        {time}
      </span>
      <span className="pb-1.5 text-2xl font-bold leading-none xl:text-3xl">
        WIB
      </span>
    </p>
  );
}
