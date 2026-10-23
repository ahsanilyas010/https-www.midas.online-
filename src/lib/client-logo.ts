// Client logos live in the existing public "workspace-branding" bucket at
// <workspace id>/clients/<client id> (no extension: the object keeps the content
// type it was uploaded with). The bucket policies already limit writes to that
// workspace's managers, and migration 95 limits types and size, so no database
// column is needed: a logo exists if the URL answers.

export const CLIENT_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const CLIENT_LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function clientLogoPath(workspaceId: string, clientId: string): string {
  return `${workspaceId}/clients/${clientId}`;
}

export function clientLogoUrl(workspaceId: string, clientId: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/workspace-branding/${clientLogoPath(workspaceId, clientId)}`;
}
