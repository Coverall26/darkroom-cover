"use client";

import { FUNDROOM_SIGNATURE_LOGO, FUNDROOM_ICON } from "@/lib/branding/favicon";

interface PoweredByFundRoomProps {
  variant?: "footer" | "corner";
  theme?: "dark" | "light";
  className?: string;
}

export function PoweredByFooter({ theme = "dark", className = "" }: { theme?: "dark" | "light"; className?: string }) {
  return (
    <div className={`flex items-center justify-center py-3 ${className}`}>
      <a
        href="https://fundroom.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <span className={`text-[10px] font-medium tracking-wide uppercase ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
          Powered by
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={FUNDROOM_ICON}
          alt="FundRoom AI"
          className="h-4 w-4"
        />
        <span className={`text-[11px] font-semibold ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
          FundRoom AI
        </span>
      </a>
    </div>
  );
}

export function PoweredByCorner({ theme = "dark", className = "" }: { theme?: "dark" | "light"; className?: string }) {
  return (
    <div className={`fixed top-4 right-4 z-50 ${className}`}>
      <a
        href="https://fundroom.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity"
      >
        <span className={`text-[9px] font-medium tracking-wide uppercase ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>
          Powered by
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={FUNDROOM_ICON}
          alt="FundRoom AI"
          className="h-3.5 w-3.5"
        />
        <span className={`text-[10px] font-semibold ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
          FundRoom AI
        </span>
      </a>
    </div>
  );
}

export default function PoweredByFundRoom({ variant = "footer", theme = "dark", className = "" }: PoweredByFundRoomProps) {
  if (variant === "corner") {
    return <PoweredByCorner theme={theme} className={className} />;
  }
  return <PoweredByFooter theme={theme} className={className} />;
}
