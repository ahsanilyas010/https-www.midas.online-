"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Loader2, UserPlus, ShieldAlert } from "lucide-react";
import { createUser, type CreateUserResult } from "@/lib/actions/users";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const initialState: CreateUserResult = {};

const ROLES = [
  { value: "agent", label: "Agent" },
  { value: "team_lead", label: "Team lead" },
  { value: "qa", label: "QA" },
  { value: "ops_manager", label: "Ops manager" },
  { value: "super_admin", label: "Super admin" },
  { value: "client_viewer", label: "Client viewer" },
];

// A free-text timezone field once let someone type "UK" instead of
// "Europe/London" — an invalid IANA zone that crashes the header's clock
// (and therefore every page) for that account. Constrained to this app's
// actual operating markets (PK/UK/US) so a typo can't get through again.
const TIMEZONES = [
  { value: "Asia/Karachi", label: "Asia/Karachi (PK)" },
  { value: "Europe/London", label: "Europe/London (UK)" },
  { value: "America/New_York", label: "America/New_York (US, Eastern)" },
  { value: "America/Chicago", label: "America/Chicago (US, Central)" },
  { value: "America/Denver", label: "America/Denver (US, Mountain)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (US, Pacific)" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
    </Button>
  );
}

type DialogProps = {
  teams: { id: string; name: string }[];
  clients: { id: string; name: string }[];
};

// Remounted after each successful create so the next one starts from a
// blank form (useActionState can't be reset in place).
export function CreateUserDialog(props: DialogProps) {
  const [round, setRound] = useState(0);
  return <CreateUserDialogRound key={round} {...props} onFinished={() => setRound((r) => r + 1)} />;
}

function CreateUserDialogRound({
  teams,
  clients,
  onFinished,
}: DialogProps & { onFinished: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createUser, initialState);
  const [role, setRole] = useState("agent");
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [teamId, setTeamId] = useState("");
  const [clientId, setClientId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.tempPassword) {
      setConfirmed(false);
      setCopied(false);
    }
  }, [state.tempPassword]);

  function handleClose(next: boolean) {
    if (!next && state.tempPassword && !confirmed) return; // can't dismiss without confirming
    setOpen(next);
    if (!next) {
      router.refresh();
      if (state.tempPassword) onFinished();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Create user
      </Button>
      <DialogContent>
        <AnimatePresence mode="wait">
          {!state.tempPassword ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader>
                <DialogTitle>Create user</DialogTitle>
                <DialogDescription>
                  One login per human. The system generates the password.
                </DialogDescription>
              </DialogHeader>
              <form action={formAction} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="full_name">Full name</Label>
                    <Input id="full_name" name="full_name" required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="agent_code">Agent code</Label>
                    <Input id="agent_code" name="agent_code" placeholder={BRAND.agentCodePlaceholder} mono />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="role">Role</Label>
                    <Select name="role" value={role} onValueChange={setRole}>
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="role" value={role} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger id="timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="timezone" value={timezone} />
                  </div>
                </div>
                {role !== "client_viewer" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="team_id">Team</Label>
                    <Select value={teamId} onValueChange={setTeamId}>
                      <SelectTrigger id="team_id">
                        <SelectValue placeholder="No team" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="team_id" value={teamId} />
                  </div>
                )}
                {role === "client_viewer" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="client_id">Client</Label>
                    <Select value={clientId} onValueChange={setClientId}>
                      <SelectTrigger id="client_id">
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input type="hidden" name="client_id" value={clientId} />
                  </div>
                )}
                {role === "agent" && (
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <Switch name="allow_login_outside_shift" />
                    Allow login outside shift window
                  </label>
                )}

                <AnimatePresence>
                  {state.error && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger"
                    >
                      {state.error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <DialogFooter>
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <SubmitButton />
                </DialogFooter>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="reveal"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-warning" /> Temporary password
                </DialogTitle>
                <DialogDescription>
                  Shown once, for {state.fullName}. Hand it to them in person — it cannot be
                  retrieved again.
                </DialogDescription>
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
                I have recorded this password and will hand it to the agent in person.
              </label>

              <DialogFooter>
                <Button disabled={!confirmed} onClick={() => handleClose(false)}>
                  Done
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
