"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Rocket } from "lucide-react";
import {
  hideChecklist as hideChecklistAction,
  showChecklist as showChecklistAction,
  markTourSeen,
  markTourCompleted,
  refreshSetupProgress,
} from "@/lib/actions/guide";
import { buildSetupSteps, doneCount, type SetupProgress, type SetupStep } from "@/lib/guide/checklist";
import { tourFor } from "@/lib/guide/tours";
import type { AppRole } from "@/lib/nav";
import { TourOverlay } from "@/components/guide/tour-overlay";
import { SetupChecklist } from "@/components/guide/setup-checklist";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface GuideInit {
  role: AppRole;
  firstName: string;
  // The shared demo workspace never auto-starts the tour (the help button still works).
  isDemo: boolean;
  tourSeen: boolean;
  checklistHidden: boolean;
  // Present for managers only.
  progress: SetupProgress | null;
}

interface GuideContextValue {
  hasTour: boolean;
  steps: SetupStep[] | null;
  done: number;
  total: number;
  checklistHidden: boolean;
  startTour: () => void;
  openChecklist: () => void;
  hideChecklist: () => void;
  showChecklist: () => void;
}

const GuideContext = createContext<GuideContextValue | null>(null);

export function useGuide(): GuideContextValue | null {
  return useContext(GuideContext);
}

const REFRESH_MS = 20_000;

export function GuideProvider({ init, children }: { init: GuideInit; children: React.ReactNode }) {
  const tourSteps = useMemo(() => tourFor(init.role), [init.role]);
  const hasTour = tourSteps.length > 0;

  const [progress, setProgress] = useState<SetupProgress | null>(init.progress);
  const [hidden, setHidden] = useState(init.checklistHidden);
  const [welcomeOpen, setWelcomeOpen] = useState(hasTour && !init.isDemo && !init.tourSeen);
  const [tourOpen, setTourOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const pathname = usePathname();

  const steps = useMemo(() => (progress ? buildSetupSteps(progress) : null), [progress]);
  const done = steps ? doneCount(steps) : 0;
  const allDone = steps ? done === steps.length : true;

  // Keep the counts current: after navigating, when the tab regains focus and,
  // while setup is unfinished and the card or dialog is on screen, every 20s.
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await refreshSetupProgress();
      if (next) setProgress(next);
    } finally {
      refreshing.current = false;
    }
  }, []);

  const isManager = init.progress !== null;
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (!isManager || allDone) return;
    if (firstPath.current === pathname) return; // the layout already supplied fresh counts
    void refresh();
  }, [pathname, isManager, allDone, refresh]);

  useEffect(() => {
    if (!isManager || allDone) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(id);
    };
  }, [isManager, allDone, refresh]);

  useEffect(() => {
    if (checklistOpen) void refresh();
  }, [checklistOpen, refresh]);

  const startTour = useCallback(() => {
    if (!hasTour) return;
    setChecklistOpen(false);
    setWelcomeOpen(false);
    setTourOpen(true);
  }, [hasTour]);

  const hideChecklist = useCallback(() => {
    setHidden(true);
    void hideChecklistAction();
  }, []);
  const showChecklist = useCallback(() => {
    setHidden(false);
    void showChecklistAction();
  }, []);

  const value = useMemo<GuideContextValue>(
    () => ({
      hasTour,
      steps,
      done,
      total: steps?.length ?? 0,
      checklistHidden: hidden,
      startTour,
      openChecklist: () => setChecklistOpen(true),
      hideChecklist,
      showChecklist,
    }),
    [hasTour, steps, done, hidden, startTour, hideChecklist, showChecklist],
  );

  function closeWelcome() {
    setWelcomeOpen(false);
    void markTourSeen();
  }

  return (
    <GuideContext.Provider value={value}>
      {children}

      <Dialog open={welcomeOpen} onOpenChange={(o) => (o ? setWelcomeOpen(true) : closeWelcome())}>
        <DialogContent data-testid="welcome-dialog">
          <DialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue text-white" aria-hidden>
              <Rocket className="h-5 w-5" />
            </div>
            <DialogTitle className="font-display text-xl">Welcome, {init.firstName}!</DialogTitle>
            <DialogDescription>
              Take a 1-minute tour? We will point out where everything is, so you know where to go and what each page is for.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row">
            <Button variant="ghost" onClick={closeWelcome}>
              I&apos;ll explore myself
            </Button>
            <Button
              onClick={() => {
                void markTourSeen();
                startTour();
              }}
            >
              Start tour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {tourOpen && (
        <TourOverlay
          steps={tourSteps}
          onClose={(completed) => {
            setTourOpen(false);
            void (completed ? markTourCompleted() : markTourSeen());
          }}
        />
      )}

      {steps && (
        <Dialog open={checklistOpen} onOpenChange={setChecklistOpen}>
          <DialogContent data-testid="setup-guide-dialog">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Setup guide</DialogTitle>
              <DialogDescription>
                {done} of {steps.length} done. Work through these in order, or jump to any step.
              </DialogDescription>
            </DialogHeader>
            <SetupChecklist steps={steps} onNavigate={() => setChecklistOpen(false)} />
            <DialogFooter className="flex-wrap justify-between">
              {hasTour ? (
                <Button variant="secondary" onClick={startTour}>
                  Take the tour
                </Button>
              ) : (
                <span />
              )}
              {hidden && (
                <Button variant="ghost" onClick={showChecklist}>
                  Show on dashboard
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </GuideContext.Provider>
  );
}
