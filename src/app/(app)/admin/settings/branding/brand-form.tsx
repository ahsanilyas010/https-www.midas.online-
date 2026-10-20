"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Trash2 } from "lucide-react";
import { updateBranding, type BrandingState } from "@/lib/actions/branding";
import { createClient } from "@/lib/supabase/client";
import { BRAND_PALETTE, DEFAULT_BRAND_COLOR, carriesWhiteText, isHexColor } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Logos are stored in the public "workspace-branding" Supabase Storage bucket
// (path <workspace id>/logo.<ext>; only that workspace's admins can write).
// The bucket itself enforces the same type and size limits (migration 95).
// SVG is not accepted: a public SVG can carry scripts.
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_EXTENSIONS = ["png", "jpg", "webp"];

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  );
}

export function BrandForm({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: { logoUrl: string | null; color: string | null; name: string | null };
}) {
  const [state, action] = useActionState<BrandingState, FormData>(updateBranding, {});
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [color, setColor] = useState(isHexColor(initial.color) ? initial.color : DEFAULT_BRAND_COLOR);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploadError(null);

    const ext = LOGO_TYPES[file.type];
    if (!ext) {
      setUploadError("Use a PNG, JPG or WebP image.");
      input.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setUploadError("That image is over 2 MB. Please use a smaller one.");
      input.value = "";
      return;
    }

    setUploading(true);
    const supabase = createClient();
    // One logo per workspace: clear any earlier file with another extension.
    await supabase.storage.from("workspace-branding").remove(LOGO_EXTENSIONS.map((x) => `${workspaceId}/logo.${x}`));
    const path = `${workspaceId}/logo.${ext}`;
    const { error } = await supabase.storage.from("workspace-branding").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setUploadError(error.message);
    } else {
      const { data } = supabase.storage.from("workspace-branding").getPublicUrl(path);
      setLogoUrl(`${data.publicUrl}?v=${Date.now()}`);
    }
    setUploading(false);
    input.value = "";
  }

  async function removeLogo() {
    setUploadError(null);
    const supabase = createClient();
    await supabase.storage.from("workspace-branding").remove(LOGO_EXTENSIONS.map((x) => `${workspaceId}/logo.${x}`));
    setLogoUrl("");
  }

  const lightWarning = isHexColor(color) && !carriesWhiteText(color);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="brand_logo_url" value={logoUrl} />
      <input type="hidden" name="brand_primary_color" value={color} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logo">
          Logo <span className="font-normal text-muted">(optional)</span>
        </Label>
        <input id="logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} className="text-sm text-ink" />
        <p className="text-xs text-muted">PNG, JPG or WebP, up to 2 MB. You can add or change it any time in Settings.</p>
        {uploading && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Loader2 className="h-3 w-3 animate-spin" /> Uploading...
          </p>
        )}
        {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
        {logoUrl && !uploading && (
          <div className="mt-1 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Logo preview" className="h-12 w-auto rounded-lg border border-line object-contain p-1" />
            <Button type="button" variant="ghost" size="sm" onClick={removeLogo}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Brand colour</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Brand colour">
          {BRAND_PALETTE.map((c) => {
            const selected = color.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.hex}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={c.name}
                title={c.name}
                onClick={() => setColor(c.hex)}
                className={`flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 transition ${
                  selected ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-2 hover:ring-brand-blue-tint-2"
                }`}
                style={{ backgroundColor: c.hex }}
              >
                {selected && <Check className="h-4 w-4 text-white" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={isHexColor(color) ? color : DEFAULT_BRAND_COLOR}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Pick a custom colour"
            className="h-9 w-12 cursor-pointer rounded-md border border-line bg-white p-1"
          />
          <Input
            aria-label="Colour code"
            value={color}
            onChange={(e) => setColor(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
            placeholder="#4338ca"
            maxLength={7}
            className="w-32 font-mono"
          />
          <span className="text-xs text-muted">or pick any colour</span>
        </div>
        {lightWarning && <p className="text-xs text-gold-text">This colour is quite light, so white text on buttons may be hard to read. A darker shade is easier on the eyes.</p>}
        <div className="mt-1 flex items-center gap-3 rounded-xl border border-line bg-canvas p-3">
          <span className="text-xs text-muted">Preview</span>
          <span
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
            style={{ backgroundColor: isHexColor(color) ? color : DEFAULT_BRAND_COLOR }}
          >
            Save
          </span>
          <span
            className="h-6 w-24 rounded-md"
            style={{
              backgroundImage: isHexColor(color)
                ? `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 62%, #1e1b4b))`
                : undefined,
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand_product_name">
          Product name shown to agents and clients <span className="font-normal text-muted">(optional)</span>
        </Label>
        <Input id="brand_product_name" name="brand_product_name" defaultValue={initial.name ?? ""} placeholder="Acme Contact Centre" />
      </div>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand-green-text">Saved. Your colour and logo now apply across the app.</p>}

      <div className="flex items-center gap-3">
        <SubmitButton label="Save" />
      </div>
    </form>
  );
}
