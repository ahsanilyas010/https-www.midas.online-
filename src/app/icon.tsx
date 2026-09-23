import { ImageResponse } from "next/og";

// Favicon/tab icon — the same gold handset drawn by <BrandMark />.
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
        <path
          d="M15.5 12.5c1-.9 2.6-.8 3.5.2l2.6 3c.8.9.8 2.3 0 3.2l-1.6 1.8c1.3 2.8 3.5 5 6.3 6.3l1.8-1.6c.9-.8 2.3-.8 3.2 0l3 2.6c1 .9 1.1 2.5.2 3.5l-1.5 1.7c-1.4 1.5-3.6 2.1-5.6 1.4-6.7-2.3-11.9-7.5-14.2-14.2-.7-2 0-4.2 1.4-5.6z"
          fill="#f5b301"
        />
        <path d="M28 12.5a8 8 0 0 1 7.5 7.5" stroke="#fff7db" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    ),
    { ...size },
  );
}
