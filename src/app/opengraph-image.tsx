import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

// Social share card (1200×630) used for Open Graph and Twitter/X previews.
export const alt = `${BRAND.productName} — contact-centre CRM with your own dialer and Zoom`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const chips = ["Dial workspace", "Bring-your-own dialer", "Zoom meetings", "Live floor", "QA & compliance"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "white",
          background:
            "radial-gradient(circle at 85% 10%, rgba(245,179,1,0.45) 0%, transparent 40%), radial-gradient(circle at 10% 90%, rgba(124,58,237,0.7) 0%, transparent 50%), linear-gradient(180deg, #0d0a2b 0%, #1b1450 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #4338ca 0%, #7c3aed 55%, #db2777 100%)",
            }}
          >
            <svg width="56" height="56" viewBox="0 0 48 48">
              <path
                d="M15.5 12.5c1-.9 2.6-.8 3.5.2l2.6 3c.8.9.8 2.3 0 3.2l-1.6 1.8c1.3 2.8 3.5 5 6.3 6.3l1.8-1.6c.9-.8 2.3-.8 3.2 0l3 2.6c1 .9 1.1 2.5.2 3.5l-1.5 1.7c-1.4 1.5-3.6 2.1-5.6 1.4-6.7-2.3-11.9-7.5-14.2-14.2-.7-2 0-4.2 1.4-5.6z"
                fill="#f5b301"
              />
            </svg>
          </div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>{BRAND.productName}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.05, display: "flex", flexWrap: "wrap" }}>
            <span>Every call,&nbsp;</span>
            <span style={{ color: "#f5b301" }}>connected.</span>
          </div>
          <div style={{ fontSize: 30, color: "rgba(255,255,255,0.78)", maxWidth: 950 }}>
            The contact-centre CRM that dials with the phone system you already pay for.
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {chips.map((c) => (
            <div
              key={c}
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 999,
                fontSize: 24,
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              {c}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
