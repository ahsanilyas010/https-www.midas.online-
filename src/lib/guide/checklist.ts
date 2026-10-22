// The dashboard "Get started" checklist. Pure data + logic so the server
// (which fetches the counts) and the client (which renders them) share it.

// Shape returned by the setup_progress() RPC (migration 98).
export interface SetupProgress {
  branded: boolean;
  zoom_connected: boolean;
  agents: number;
  campaigns: number;
  leads: number;
  leads_passed: number;
  assignments: number;
  calls: number;
}

export interface SetupStep {
  id: string;
  title: string;
  why: string;
  href: string;
  cta: string;
  done: boolean;
  optional?: boolean;
}

export function buildSetupSteps(p: SetupProgress): SetupStep[] {
  return [
    {
      id: "brand",
      title: "Make it yours",
      why: "Add your logo and colour so the app looks like your company to your agents and clients.",
      href: "/admin/settings/branding",
      cta: "Open branding",
      done: p.branded,
      optional: true,
    },
    {
      id: "zoom",
      title: "Connect Zoom",
      why: "Agents place and answer calls through Zoom Phone, so connect your Zoom account first.",
      href: "/admin/settings/zoom",
      cta: "Connect Zoom",
      done: p.zoom_connected,
    },
    {
      id: "team",
      title: "Add your first agent",
      why: "Create a login for each agent. They get a one-time password and can start straight away.",
      href: "/admin/people",
      cta: "Add people",
      done: p.agents >= 1,
    },
    {
      id: "campaign",
      title: "Create a campaign",
      why: "A campaign groups the leads, script and calling hours for one project. It belongs to a client, so add the client first if you have none.",
      href: "/admin/campaigns",
      cta: "Create a campaign",
      done: p.campaigns >= 1,
    },
    {
      id: "leads",
      title: "Add leads",
      why: "Upload a CSV or Excel file of any shape and say what each column is. Everything in the file comes through, and you can even call them yourself.",
      href: "/admin/import",
      cta: "Upload leads",
      done: p.leads >= 1,
    },
    {
      id: "screen",
      title: "Screen your leads",
      why: "Screening checks numbers against do-not-call and suppression lists so you only dial people you are allowed to.",
      href: "/admin/compliance",
      cta: "Screen leads",
      done: p.leads_passed >= 1,
    },
    {
      id: "assign",
      title: "Put agents on the campaign",
      why: "Open the campaign and use Manage agents so each agent gets leads to call.",
      href: "/admin/campaigns",
      cta: "Choose a campaign",
      done: p.assignments >= 1,
    },
    {
      id: "call",
      title: "Make your first call",
      why: "Open the Dial workspace and place a test call to see the whole flow working.",
      href: "/dial",
      cta: "Open Dial workspace",
      done: p.calls >= 1,
    },
  ];
}

// The step to highlight: the first unfinished required step; if only optional
// ones remain, the first of those; null when everything is done.
export function recommendedStep(steps: SetupStep[]): SetupStep | null {
  return steps.find((s) => !s.done && !s.optional) ?? steps.find((s) => !s.done) ?? null;
}

// Progress counts required steps only: an optional step (branding) is shown
// but never makes "4 of 8" look unfinished once everything needed is done.
export function requiredSteps(steps: SetupStep[]): SetupStep[] {
  return steps.filter((s) => !s.optional);
}

export function doneCount(steps: SetupStep[]): number {
  return requiredSteps(steps).filter((s) => s.done).length;
}
