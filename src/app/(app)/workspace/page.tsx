import { requireProfile } from "@/lib/auth/current-profile";
import { getAssignedCampaigns, getNextLead, getDispositions, getQueueCounts } from "@/lib/actions/workspace";
import { Workspace } from "./workspace";
import { NoCampaignAssigned } from "./no-campaign-assigned";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign: requested } = await searchParams;
  const profile = await requireProfile();
  const campaigns = await getAssignedCampaigns();

  if (campaigns.length === 0) {
    return <NoCampaignAssigned agentName={profile.full_name} />;
  }

  const campaign = campaigns.find((c) => c.id === requested) ?? campaigns[0];
  const [lead, dispositions, counts] = await Promise.all([
    getNextLead(campaign.id),
    getDispositions(campaign.id),
    getQueueCounts(campaign.id),
  ]);

  return (
    <Workspace
      key={campaign.id}
      agentName={profile.full_name}
      agentTimezone={profile.timezone}
      campaign={campaign}
      campaigns={campaigns.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
      initialLead={lead}
      dispositions={dispositions}
      initialCounts={counts}
    />
  );
}
