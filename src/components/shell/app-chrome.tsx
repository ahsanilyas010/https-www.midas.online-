"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { PageTransition } from "@/components/shell/page-transition";
import type { NavItem } from "@/lib/nav";
import type { Profile } from "@/lib/auth/current-profile";
import type { CurrentSession } from "@/lib/actions/attendance";
import type { FollowupRow } from "@/lib/actions/followups";

// Phase 8 — "Mobile layout for attendance and follow-ups (agents will
// clock in on their phones)." The sidebar was always visible at 56-208px,
// permanently eating a third of a phone's width. Below the `md` breakpoint
// it's now an off-canvas drawer opened from a hamburger button in the
// header, so the clock-in control and follow-up tray — the two things an
// agent actually needs on a phone — get the full screen width.
export function AppChrome({
  items,
  profile,
  initialSession,
  initialFollowups,
  children,
}: {
  items: NavItem[];
  profile: Profile;
  initialSession: CurrentSession | null;
  initialFollowups: FollowupRow[];
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
      </AnimatePresence>

      <div
        className={`fixed inset-y-0 left-0 z-50 md:static md:z-auto ${
          mobileNavOpen ? "flex" : "hidden md:flex"
        }`}
      >
        <Sidebar items={items} onNavigate={() => setMobileNavOpen(false)} />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          profile={profile}
          initialSession={initialSession}
          initialFollowups={initialFollowups}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <PageTransition>{children}</PageTransition>
      </div>
    </div>
  );
}
