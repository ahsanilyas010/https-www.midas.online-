// Typed errors a server action can catch to show a field-specific message,
// as opposed to a generic "something went wrong". Was src/lib/accounts/types.ts's
// AccountError, back when accounts had its own Firebase-backed error
// vocabulary; kept as a shared, backend-agnostic type now that signup/auth
// run directly against Supabase Auth.
export class AccountError extends Error {
  constructor(
    public code: "email_exists" | "invalid_credentials" | "weak_password" | "not_found" | "disabled" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}
