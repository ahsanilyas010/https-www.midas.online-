import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/current-profile";
import { listDispositions } from "@/lib/actions/dial-workspace";
import { loadCallSheet } from "@/lib/actions/callsheet";
import { CallSheetBoard } from "./callsheet-board";

export const metadata: Metadata = { title: "Call sheet" };

// Everything a caller works from in one board: one column per campaign, cards
// grouped by urgency. Dialing from a card goes through the same compliance gate
// as the dial queue (claim_lead_for_call, migration 104).
export default async function CallSheetPage() {
  const profile = await requireRole(["agent", "team_lead", "super_admin", "ops_manager"]);
  const [sheet, dispositions] = await Promise.all([loadCallSheet(), listDispositions()]);

  if (sheet.error) {
    return (
      <div className="p-6">
        <p role="alert" className="rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger">
          {sheet.error}
        </p>
      </div>
    );
  }

  return (
    <CallSheetBoard
      initialItems={sheet.items}
      total={sheet.total}
      dispositions={dispositions}
      timezone={profile.timezone}
    />
  );
}
