import { ImageResponse } from "next/og";

// Favicon/tab icon — the same gold crown "M" drawn by <BrandMark />.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <svg width="32" height="32" viewBox="0 0 48 48">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4338ca" />
            <stop offset="55%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#db2777" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#bg)" />
        <path d="M11 33 L13.5 15 L19.5 24 L24 13 L28.5 24 L34.5 15 L37 33 Z" fill="#f5b301" />
        <rect x="11" y="34.5" width="26" height="3" rx="1.5" fill="#f5b301" />
      </svg>
    ),
    { ...size },
  );
}
