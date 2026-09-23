import { ImageResponse } from "next/og";

// Favicon/tab icon — reuses the same placeholder brand mark (three circles
// in the exact brand hexes) rendered elsewhere by <BrandMark />, since the
// real DialDesk logo asset hasn't been supplied to this build (see
// public/brand/README.md).
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <svg width="32" height="32" viewBox="0 0 48 48">
        <circle cx="18" cy="18" r="9" fill="#064288" />
        <circle cx="32" cy="16" r="6.5" fill="#f87026" />
        <circle cx="24" cy="32" r="7.5" fill="#76b049" />
      </svg>
    ),
    { ...size },
  );
}
