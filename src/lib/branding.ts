import type { CSSProperties } from "react";

// Colours a customer can choose for their workspace. All are dark enough to
// carry white text (buttons, the sidebar highlight, headers).
export const BRAND_PALETTE: { name: string; hex: string }[] = [
  { name: "Indigo", hex: "#4338ca" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Sky", hex: "#0369a1" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Emerald", hex: "#047857" },
  { name: "Green", hex: "#15803d" },
  { name: "Amber", hex: "#b45309" },
  { name: "Orange", hex: "#c2410c" },
  { name: "Red", hex: "#b91c1c" },
  { name: "Rose", hex: "#be123c" },
  { name: "Pink", hex: "#be185d" },
  { name: "Purple", hex: "#7e22ce" },
  { name: "Slate", hex: "#334155" },
];

export const DEFAULT_BRAND_COLOR = BRAND_PALETTE[0].hex;

export function isHexColor(value: string | null | undefined): value is string {
  return Boolean(value) && /^#[0-9a-fA-F]{6}$/.test(value as string);
}

// WCAG relative luminance (0 = black, 1 = white).
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

// White text on this colour reaches at least 4.5:1 contrast (readable).
export function carriesWhiteText(hex: string): boolean {
  return 1.05 / (luminance(hex) + 0.05) >= 4.5;
}

// CSS custom properties that re-theme the signed-in app around one colour.
// The tints, hover shade, gradient and sidebar are derived from it, so a single
// choice changes the whole look consistently. Returns nothing for an unset or
// invalid colour (the default theme stays).
export function brandStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!isHexColor(color)) return undefined;
  return {
    "--brand-blue": color,
    "--brand-blue-hover": `color-mix(in srgb, ${color} 82%, black)`,
    "--brand-blue-tint": `color-mix(in srgb, ${color} 10%, white)`,
    "--brand-blue-tint-2": `color-mix(in srgb, ${color} 22%, white)`,
    "--brand-gradient": `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 62%, #1e1b4b) 100%)`,
    "--midnight": `color-mix(in srgb, ${color} 16%, #07061a)`,
    "--midnight-2": `color-mix(in srgb, ${color} 34%, #0d0a2b)`,
  } as CSSProperties;
}
