import { redirect } from "next/navigation";

// Lead upload lives in one place now: /admin/import (every upload names a data
// source and appears under Data > Import history). This old address only
// forwards, so existing bookmarks keep working.
export default function LeadsSettingsRedirect() {
  redirect("/admin/import");
}
