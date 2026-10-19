// Cheap, network-free check for whether a Supabase Auth session cookie is
// present (used by the marketing header to show "Open the app" vs "Sign in").
// Not a security check: real access is enforced by requireProfile() + RLS.
export function hasRealSessionCookie(cookieStore: { getAll(): { name: string }[] }): boolean {
  return cookieStore.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}
