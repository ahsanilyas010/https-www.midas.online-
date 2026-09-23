import { Headset } from "lucide-react";

export function NoCampaignAssigned({ agentName }: { agentName: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm animate-slide-up text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue-tint">
          <Headset className="h-6 w-6 text-brand-blue" />
        </div>
        <h2 className="mb-1 text-base font-semibold text-ink">No campaign assigned yet</h2>
        <p className="text-sm text-muted">
          {agentName}, you&rsquo;re not assigned to a campaign. Ask your team lead or ops manager
          to add you in Campaigns → a campaign&rsquo;s agent roster.
        </p>
      </div>
    </div>
  );
}
