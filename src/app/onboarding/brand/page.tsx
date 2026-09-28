import { getCurrentWorkspace } from "@/lib/workspace/current";
import { STEP_LABEL } from "../steps";
import { BrandForm } from "./brand-form";

export default async function OnboardingBrandPage() {
  const workspace = await getCurrentWorkspace();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">{STEP_LABEL.brand}</h1>
      <p className="mt-1 text-sm text-muted">
        Your logo, colour and product name appear in the sidebar and header for every agent and client.
      </p>
      <div className="mt-6">
        <BrandForm
          workspaceId={workspace.id}
          initial={{
            logoUrl: workspace.brand_logo_url,
            color: workspace.brand_primary_color,
            name: workspace.brand_product_name,
          }}
        />
      </div>
    </div>
  );
}
