"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWorkspaceStatus } from "@/lib/actions/platform";

export function SuspendButton({ workspaceId, status }: { workspaceId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const suspended = status === "suspended";

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setWorkspaceStatus(workspaceId, suspended ? "active" : "suspended");
          router.refresh();
        })
      }
      className={`text-xs font-semibold hover:underline disabled:opacity-60 ${suspended ? "text-brand-green-text" : "text-danger"}`}
    >
      {pending ? "Working..." : suspended ? "Reactivate" : "Suspend"}
    </button>
  );
}
