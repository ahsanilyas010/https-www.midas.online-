import { requireProfile } from "@/lib/auth/current-profile";
import { redirect } from "next/navigation";
import { getCallsNeedingReview, getActiveScorecard } from "@/lib/actions/qa";
import { Badge } from "@/components/ui/badge";
import { ReviewDialog } from "./review-dialog";

export default async function QaQueuePage() {
  const profile = await requireProfile();
  if (!["qa", "super_admin", "ops_manager"].includes(profile.role)) redirect("/");

  const [calls, scorecard] = await Promise.all([getCallsNeedingReview(), getActiveScorecard()]);

  return (
    <div className="p-4">
      <div className="mb-3">
        <p className="text-xs text-muted">
          {calls.length} calls awaiting review
          {scorecard && (
            <>
              {" "}
              · scoring against <span className="font-medium text-ink">{scorecard.name}</span> (
              {scorecard.pass_threshold}% pass threshold)
            </>
          )}
        </p>
      </div>

      {!scorecard ? (
        <div className="rounded-lg border border-dashed border-line bg-white p-10 text-center text-sm text-muted">
          No active QA scorecard configured yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Lead</th>
                <th className="px-3 py-2 font-medium">Disposition</th>
                <th className="px-3 py-2 font-medium">Talk time</th>
                <th className="px-3 py-2 font-medium">Window</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} className="h-[38px] border-b border-line last:border-0">
                  <td className="px-3 py-1.5 font-medium text-ink">{c.profiles?.full_name}</td>
                  <td className="px-3 py-1.5 text-muted">
                    {[c.leads?.first_name, c.leads?.last_name].filter(Boolean).join(" ") ||
                      c.leads?.phone_e164}
                  </td>
                  <td className="px-3 py-1.5 text-muted">{c.dispositions?.label ?? "—"}</td>
                  <td className="px-3 py-1.5 tabular text-muted">
                    {c.talk_seconds ? `${Math.round(c.talk_seconds / 60)}m ${c.talk_seconds % 60}s` : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    {c.within_call_window ? (
                      <Badge variant="confirm">In window</Badge>
                    ) : (
                      <Badge variant="danger">Out of window</Badge>
                    )}
                  </td>
                  <td className="px-3 py-1.5 tabular text-xs text-muted">
                    {new Date(c.started_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <ReviewDialog call={c} scorecard={scorecard} />
                  </td>
                </tr>
              ))}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">
                    Nothing to review. Queue is clear.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
