"use server";

import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import type { SheetItem } from "@/lib/callsheet/derive";

const SHEET_ROLES = ["super_admin", "ops_manager", "team_lead", "agent"];

const SHEET_LIMIT = 300;

// The whole board in one RPC (call_sheet, migration 105). RLS applies.
export async function loadCallSheet(): Promise<{ error?: string; items: SheetItem[]; total: number }> {
  const profile = await requireRealProfile();
  if (!SHEET_ROLES.includes(profile.role)) return { error: "The call sheet isn't available for your role.", items: [], total: 0 };
  const supabase = await createRealClient();
  const { data, error } = await supabase.rpc("call_sheet", { p_limit: SHEET_LIMIT });
  if (error) return { error: error.message, items: [], total: 0 };
  const rows = data ?? [];
  const items: SheetItem[] = rows.map((r) => ({
    ...r,
    phone_display: r.phone_e164 ? (parsePhoneNumberFromString(r.phone_e164)?.formatInternational() ?? r.phone_e164) : null,
  }));
  return { items, total: Number(rows[0]?.total_count ?? 0) };
}

export interface ClaimResult {
  error?: string;
  ok?: boolean;
}

// First step of dialing from a card: take the lead through the same compliance
// gate as the dial queue (claim_lead_for_call re-checks every rule under a row
// lock and either claims the lead for the caller or raises the reason).
export async function claimLeadForCall(leadId: string): Promise<ClaimResult> {
  if (!z.string().uuid().safeParse(leadId).success) return { error: "Invalid lead." };
  const profile = await requireRealProfile();
  if (!SHEET_ROLES.includes(profile.role)) return { error: "Only dialing staff can place calls." };
  const supabase = await createRealClient();
  const { error } = await supabase.rpc("claim_lead_for_call", { p_lead_id: leadId });
  if (error) return { error: error.message };
  return { ok: true };
}

// Fresh dialability for one card (after an outcome is logged or a field edit).
export async function leadBlockReason(leadId: string): Promise<{ error?: string; reason: string | null }> {
  if (!z.string().uuid().safeParse(leadId).success) return { error: "Invalid lead.", reason: null };
  const profile = await requireRealProfile();
  const supabase = await createRealClient();
  const { data, error } = await supabase.rpc("lead_dial_block_reason", { p_lead_id: leadId, p_agent_id: profile.id });
  if (error) return { error: error.message, reason: null };
  return { reason: data ?? null };
}
