"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { CLIENT_LOGO_MAX_BYTES, CLIENT_LOGO_TYPES, clientLogoPath } from "@/lib/client-logo";

// Upload, replace or remove one client's logo. The preview <img> hides itself
// when no logo has been uploaded yet.
export function ClientLogoField({ workspaceId, clientId, initialUrl }: { workspaceId: string; clientId: string; initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [hasLogo, setHasLogo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = clientLogoPath(workspaceId, clientId);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    if (!(CLIENT_LOGO_TYPES as readonly string[]).includes(file.type)) {
      setError("Use a PNG, JPG or WebP image.");
      input.value = "";
      return;
    }
    if (file.size > CLIENT_LOGO_MAX_BYTES) {
      setError("That image is over 2 MB. Please use a smaller one.");
      input.value = "";
      return;
    }
    setBusy(true);
    const { error: err } = await createClient().storage.from("workspace-branding").upload(path, file, { upsert: true, contentType: file.type });
    if (err) setError(err.message);
    else {
      setHasLogo(true);
      setUrl(`${initialUrl}?v=${Date.now()}`);
    }
    setBusy(false);
    input.value = "";
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().storage.from("workspace-branding").remove([path]);
    if (err) setError(err.message);
    else setHasLogo(false);
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-12 w-24 items-center justify-center rounded-lg border border-line bg-canvas">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="max-h-full max-w-full object-contain p-1" onError={() => setHasLogo(false)} />
        ) : (
          <span className="text-[10px] text-muted">No logo</span>
        )}
      </div>
      <label className="cursor-pointer rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-canvas">
        {hasLogo ? "Replace" : "Upload logo"}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile} disabled={busy} />
      </label>
      {hasLogo && (
        <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={busy}>
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </Button>
      )}
      {busy && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}
