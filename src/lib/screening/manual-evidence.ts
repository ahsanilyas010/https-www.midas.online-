import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScreeningResult } from "./types";

// Section 4.4 — "ManualEvidenceProvider — upload a bureau's response file
// when no API exists." This is the one screening path that's fully real
// without needing a live bureau account: an operator runs the check
// through the bureau's own portal, downloads the response file (matched
// numbers), and uploads it here. The file itself is retained in Storage as
// the evidence artefact — "no evidence, no pass" is enforced by
// `evidencePath` never being null on this provider's result.
export async function manualEvidenceScreen(params: {
  file: File;
  matchedPhoneNumbers: string[];
  providerReference: string;
}): Promise<ScreeningResult> {
  const supabase = createAdminClient();
  const path = `screening-evidence/${Date.now()}-${params.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error } = await supabase.storage
    .from("compliance-evidence")
    .upload(path, await params.file.arrayBuffer(), {
      contentType: params.file.type || "application/octet-stream",
    });
  if (error) throw new Error(`Could not store evidence file: ${error.message}`);

  return {
    matched: params.matchedPhoneNumbers,
    evidencePath: path,
    providerReference: params.providerReference,
  };
}
