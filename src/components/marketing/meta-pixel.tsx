"use client";

import Script from "next/script";
import { MARKETING } from "@/lib/brand";

type Fbq = (...args: unknown[]) => void;

// Fires a standard Meta Pixel event if the pixel is loaded; a no-op otherwise.
export function trackPixel(event: string, params?: Record<string, unknown>) {
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (fbq) fbq("track", event, params);
}

// Meta Pixel base code. Only rendered when MARKETING.metaPixelId is set.
export function MetaPixel() {
  const id = MARKETING.metaPixelId;
  if (!id) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(id)});fbq('track','PageView');`}
    </Script>
  );
}
