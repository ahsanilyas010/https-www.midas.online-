import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand/mark";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <BrandMark size={40} />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-ink">Set a new password</h1>
            <p className="text-xs text-muted">
              Required before you can reach any other screen.
            </p>
          </div>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
