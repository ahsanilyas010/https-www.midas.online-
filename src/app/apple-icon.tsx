import { ImageResponse } from "next/og";

// Home-screen icon for iOS/Android — the same gold handset as the favicon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4338ca 0%, #7c3aed 55%, #db2777 100%)",
        }}
      >
        <svg width="130" height="130" viewBox="0 0 48 48">
          <path
            d="M15.5 12.5c1-.9 2.6-.8 3.5.2l2.6 3c.8.9.8 2.3 0 3.2l-1.6 1.8c1.3 2.8 3.5 5 6.3 6.3l1.8-1.6c.9-.8 2.3-.8 3.2 0l3 2.6c1 .9 1.1 2.5.2 3.5l-1.5 1.7c-1.4 1.5-3.6 2.1-5.6 1.4-6.7-2.3-11.9-7.5-14.2-14.2-.7-2 0-4.2 1.4-5.6z"
            fill="#f5b301"
          />
          <path d="M28 12.5a8 8 0 0 1 7.5 7.5" stroke="#fff7db" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <path d="M27.5 17.2a3.6 3.6 0 0 1 3.3 3.3" stroke="#fff7db" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
