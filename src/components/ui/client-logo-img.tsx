"use client";

import { useState } from "react";

// A client's logo, or the fallback text when none has been uploaded (the URL
// then 404s and the image is dropped).
export function ClientLogoImg({ src, fallback }: { src: string; fallback: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="max-h-full max-w-full object-contain p-1" onError={() => setOk(false)} />;
}
