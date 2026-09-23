import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current-profile";
import { homeFor } from "@/lib/nav";

export default async function RootPage() {
  const profile = await requireProfile();
  redirect(homeFor(profile.role));
}
