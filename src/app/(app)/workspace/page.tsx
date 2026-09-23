import { requireProfile } from "@/lib/auth/current-profile";
import { getAssignedCampaigns, getNextLead, getDispositions, getQueueCounts } from "@/lib/actions/workspace";
import { Workspace } from "./workspace";
import { NoCampaignAssigned } from "./no-campaign-assigned";

export default async function WorkspacePage() {
  const profile = await requireProfile();
  const campaigns = await getAssignedCampaigns();

  if (campaigns.length === 0) {
    return <NoCampaignAssigned agentName={profile.full_name} />;
  }

  const campaign = campaigns[0];
  const [lead, dispositions, counts] = await Promise.all([
    getNextLead(campaign.id),
    getDispositions(campaign.id),
    getQueueCounts(campaign.id),
  ]);

  return (
    <Workspace
      agentName={profile.full_name}
      agentTimezone={profile.timezone}
      campaign={campaign}
      initialLead={lead}
      dispositions={dispositions}
      initialCounts={counts}
    />
  );
}
