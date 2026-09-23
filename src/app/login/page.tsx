import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/brand/mark";
import { BRAND } from "@/lib/brand";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4"
      style={{
        backgroundImage:
          "radial-gradient(circle at 15% 20%, var(--brand-blue-tint) 0%, transparent 45%)," +
          "radial-gradient(circle at 85% 15%, var(--brand-orange-tint) 0%, transparent 40%)," +
          "radial-gradient(circle at 50% 90%, var(--brand-green-tint) 0%, transparent 45%)",
      }}
    >
      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="rounded-2xl bg-white p-3 shadow-lg shadow-brand-blue/10">
            <BrandMark size={40} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-ink">{BRAND.productName}</h1>
            <p className="text-xs text-muted">{BRAND.loginTagline}</p>
          </div>
        </div>
        <LoginForm next={next} />
        <p className="mt-6 text-center text-xs text-muted">
          One login per person. Lost your password? Ask your team lead.
        </p>
      </div>
    </div>
  );
}
