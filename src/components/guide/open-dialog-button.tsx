"use client";

import { Button } from "@/components/ui/button";

// Opens a dialog that lives elsewhere on the page (the dialog listens for the
// same window event). Used by empty states so the real dialog stays mounted
// when the empty state disappears after the first record is created.
export function OpenDialogButton({ event, icon, children }: { event: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Button onClick={() => window.dispatchEvent(new Event(event))}>
      {icon} {children}
    </Button>
  );
}
