"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { updateBranding, type BrandingState } from "@/lib/actions/branding";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${workspaceId}/logo.${ext}`;
    const { error } = await supabase.storage
      .from("workspace-branding")
      .upload(path, file, { upsert: true, contentType: file.type || "image/png" });
    if (error) {
      setUploadError(error.message);
    } else {
      const { data } = supabase.storage.from("workspace-branding").getPublicUrl(path);
      setLogoUrl(`${data.publicUrl}?v=${Date.now()}`);
    }
    setUploading(false);
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="brand_logo_url" value={logoUrl} />
      <input type="hidden" name="advance" value="true" />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logo">Logo</Label>
        <input id="logo" type="file" accept="image/*" onChange={handleFile} className="text-sm text-ink" />
        {uploading && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Loader2 className="h-3 w-3 animate-spin" /> Uploading...
          </p>
        )}
        {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
        {logoUrl && !uploading && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo preview" className="mt-1 h-12 w-auto rounded-lg border border-line object-contain p-1" />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand_primary_color">Primary colour</Label>
        <Input
          id="brand_primary_color"
          name="brand_primary_color"
          type="text"
          defaultValue={initial.color ?? "#4f46e5"}
          placeholder="#4f46e5"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand_product_name">Product name shown to agents and clients</Label>
        <Input id="brand_product_name" name="brand_product_name" defaultValue={initial.name ?? ""} placeholder="Acme Contact Centre" />
      </div>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
