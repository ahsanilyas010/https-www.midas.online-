-- Extensions and the global role enum. Everything else in Phase 1 depends
-- on app_role existing first.
create extension if not exists pgcrypto with schema extensions;

create type app_role as enum
  ('super_admin','ops_manager','team_lead','qa','agent','client_viewer');
