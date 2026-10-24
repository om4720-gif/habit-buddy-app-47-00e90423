import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Monitor, Moon, Sun } from "lucide-react";

import { ConnectedGradeLink } from "@/components/ConnectedGradeLink";
import { ScrollPad } from "@/components/ScrollPad";
import { WebhookSetup } from "@/components/WebhookSetup";
import { OPEN_TOUR_EVENT } from "@/components/WelcomeTour";
import { setColorMode, useColorMode, type ColorMode } from "@/lib/customize";
import {
  exportBackup,
  exportDeadlinesCsv,
  exportDeadlinesIcs,
  exportHabitCsv,
  exportStudyCsv,
} from "@/lib/export";
import { useUserSettings } from "@/lib/useUserSettings";

export function SettingsDialog() {
  const { settings, save } = useUserSettings();
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState(settings.agent_name);
  const [page, setPage] = useState(settings.habit_page_name);
  const [busy, setBusy] = useState<string | null>(null);
  const mode = useColorMode();

  const run = async (id: string, job: () => Promise<string>) => {
    setBusy(id);
    try {
      toast.success(await job());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (open) {
      setAgent(settings.agent_name);
      setPage(settings.habit_page_name);
    }
  }, [open, settings]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:text-ink"
      >
        Settings
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
<ScrollPad />
          <DialogHeader>
            <DialogTitle>Personalize</DialogTitle>
          </DialogHeader>
          <div>
            <p className="text-sm font-medium text-ink">Appearance</p>
            <div
              className="mt-2 inline-flex rounded-full bg-cream p-1 ring-1 ring-black/5"
              role="radiogroup"
              aria-label="Appearance"
            >
              {(
                [
                  ["light", "Light", Sun],
                  ["dark", "Dark", Moon],
                  ["system", "System", Monitor],
                ] as [ColorMode, string, typeof Sun][]
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  onClick={() => setColorMode(id)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    mode === id
                      ? "bg-card text-ink shadow-sm ring-1 ring-black/5"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">
              System follows your phone or computer, including at night.
            </p>
          </div>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await save({
                  agent_name: agent.trim().slice(0, 30) || "Mero",
                  habit_page_name: page.trim().slice(0, 30) || "Main habit",
                });
                toast.success("Saved");
                setOpen(false);
              } catch {
                toast.error("Could not save");
              }
            }}
          >
            <label className="block text-sm">
              Agent name
              <Input className="mt-1" value={agent} onChange={(e) => setAgent(e.target.value)} />
            </label>
            <label className="block text-sm">
              Main habit page name
              <Input className="mt-1" value={page} onChange={(e) => setPage(e.target.value)} />
            </label>
            <Button type="submit" className="w-full">
              Save
            </Button>
            <button
              type="button"
              className="block w-full text-center text-xs text-ink-soft underline-offset-2 hover:text-ink hover:underline"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
              }}
            >
              Replay the welcome tour
            </button>
          </form>

          <div className="mt-2 border-t border-line pt-4">
            <ConnectedGradeLink />
            <div className="mt-4 border-t border-line pt-4">
              <WebhookSetup />
            </div>
          </div>

          <div className="mt-2 border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">Your data</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              Take a copy with you, or put your deadlines in your calendar.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                {
                  id: "ics",
                  label: "Calendar (.ics)",
                  job: async () => {
                    const n = await exportDeadlinesIcs();
                    return n
                      ? `${n} deadline${n === 1 ? "" : "s"} exported. Open the file to add them to your calendar.`
                      : "No open deadlines to export.";
                  },
                },
                {
                  id: "json",
                  label: "Full backup (JSON)",
                  job: async () => {
                    const r = await exportBackup();
                    return r.failed.length
                      ? `Backup saved, but ${r.failed.join(", ")} could not be read.`
                      : "Backup saved.";
                  },
                },
                {
                  id: "habits",
                  label: "Habit history (CSV)",
                  job: async () => `${await exportHabitCsv()} check-ins exported.`,
                },
                {
                  id: "study",
                  label: "Courses & lectures (CSV)",
                  job: async () => `${await exportStudyCsv()} lectures exported.`,
                },
                {
                  id: "deadlines",
                  label: "Deadlines (CSV)",
                  job: async () => `${await exportDeadlinesCsv()} deadlines exported.`,
                },
              ].map((b) => (
                <Button
                  key={b.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto whitespace-normal py-2 text-xs"
                  disabled={busy !== null}
                  onClick={() => run(b.id, b.job)}
                >
                  {busy === b.id ? "Preparing…" : b.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-soft">
              Photo files aren't included in the backup, only their records.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
