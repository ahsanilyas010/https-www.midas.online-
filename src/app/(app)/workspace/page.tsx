import { redirect } from "next/navigation";

// The legacy dial workspace was replaced by the real /dial screen.
export default function WorkspacePage() {
  redirect("/dial");
}
