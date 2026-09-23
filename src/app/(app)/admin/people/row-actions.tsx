"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, KeyRound, UserX, UserCheck, Copy, Check, Megaphone } from "lucide-react";
import { resetPassword, type ResetPasswordResult } from "@/lib/actions/users";
import { deactivateUser, reactivateUser } from "@/lib/actions/deactivate";
import { AssignToCampaignDialog } from "./assign-campaign-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

const initialState: ResetPasswordResult = {};

export function PeopleRowActions({
  userId,
  userName,
  isActive,
  campaigns,
}: {
  userId: string;
  userName: string;
  isActive: boolean;
  campaigns: { id: string; name: string; code: string }[];
}) {
  const router = useRouter();
  const [resetOpen, setResetOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [state, formAction] = useActionState(resetPassword, initialState);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setResetOpen(true)}>
            <KeyRound className="mr-2 h-3.5 w-3.5" /> Reset password
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAssignOpen(true)}>
            <Megaphone className="mr-2 h-3.5 w-3.5" /> Assign to campaign
          </DropdownMenuItem>
          {isActive ? (
            <DropdownMenuItem
              variant="danger"
              onSelect={async () => {
                await deactivateUser(userId);
                router.refresh();
              }}
            >
              <UserX className="mr-2 h-3.5 w-3.5" /> Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={async () => {
                await reactivateUser(userId);
                router.refresh();
              }}
            >
              <UserCheck className="mr-2 h-3.5 w-3.5" /> Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AssignToCampaignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        userId={userId}
        userName={userName}
        campaigns={campaigns}
      />

      <Dialog
        open={resetOpen}
        onOpenChange={(next) => {
          if (!next && state.tempPassword && !confirmed) return;
          setResetOpen(next);
          if (!next) router.refresh();
        }}
      >
        <DialogContent>
          {!state.tempPassword ? (
            <form action={formAction}>
              <input type="hidden" name="user_id" value={userId} />
              <DialogHeader>
                <DialogTitle>Reset password</DialogTitle>
                <DialogDescription>
                  Issues a new one-time temporary password. Their old password stops working
                  immediately.
                </DialogDescription>
              </DialogHeader>
              {state.error && (
                <p className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger">
                  {state.error}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setResetOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Reset</Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>New temporary password</DialogTitle>
                <DialogDescription>Shown once. Hand it to them in person.</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2.5">
                <code className="tabular flex-1 text-base font-medium tracking-wide">
                  {state.tempPassword}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    await navigator.clipboard.writeText(state.tempPassword!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="h-4 w-4 text-brand-green-text" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <label className="mt-4 flex items-start gap-2 text-sm">
                <Checkbox
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                  className="mt-0.5"
                />
                I have recorded this password and will hand it to them in person.
              </label>
              <DialogFooter>
                <Button
                  disabled={!confirmed}
                  onClick={() => {
                    setResetOpen(false);
                    router.refresh();
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
