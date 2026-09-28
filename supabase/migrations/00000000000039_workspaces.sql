-- Phase 1, migration 2 of 9 — workspaces: the tenant boundary everything
-- else hangs off. One deployment, one database, isolation by RLS.

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  plan workspace_plan not null default 'free',
  seat_limit int not null default 3,
  status workspace_status not null default 'onboarding',
  is_demo boolean not null default false,

  billing_status text not null default 'none'
    check (billing_status in ('none', 'active', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,

  -- Per-workspace branding shown to agents and clients (spec: "logo,
  -- primary colour, product name"). Nullable — falls back to the app's
  -- default BRAND constant when unset.
  brand_logo_url text,
  brand_primary_color text check (brand_primary_color ~ '^#[0-9a-fA-F]{6}$'),
  brand_product_name text,

  -- Drives the onboarding wizard's resume-where-you-left-off behaviour
  -- (src/app/start/*). null/'brand' means step 1.
  onboarding_step text,

  -- Attribution captured at signup (utm_source, fbclid, referrer, ...).
  signup jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspaces_status_idx on workspaces (status);
create index workspaces_is_demo_idx on workspaces (is_demo);

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspaces_set_updated_at
  before update on workspaces
  for each row execute function set_updated_at();
