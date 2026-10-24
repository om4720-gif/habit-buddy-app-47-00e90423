import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  connectGradeFeed,
  disconnectGradeFeed,
  getGradeFeedStatus,
  syncGradeFeedNow,
} from "@/lib/grade-feed.functions";

/** The connected grades link, shown in Settings. Grades are checked automatically; this only manages the link. */
export function ConnectedGradeLink() {
  const queryClient = useQueryClient();
  const feedStatusFn = useServerFn(getGradeFeedStatus);
  const connectFeedFn = useServerFn(connectGradeFeed);
  const disconnectFeedFn = useServerFn(disconnectGradeFeed);
  const syncFeedFn = useServerFn(syncGradeFeedNow);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedKey, setFeedKey] = useState("");
  const { data: feed, refetch: refetchFeed } = useQuery({
    queryKey: ["grade-feed-status"],
    queryFn: () => feedStatusFn(),
    retry: false,
  });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-semibold text-ink">Connected grades link</p>
        {feed ? (
          <>
            <p className="mt-1 text-xs text-ink-soft">
              Connected to <span className="font-medium text-ink">{feed.host}</span>. Checked every 3 hours.
              {feed.last_checked_at ? ` Last check: ${new Date(feed.last_checked_at).toLocaleString()}.` : ""}
            </p>
            {feed.last_status && (
              <p className={`mt-1 text-xs ${feed.last_status.startsWith("error") ? "text-destructive" : "text-ink-soft"}`}>
                Status: {feed.last_status}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="rounded-full"
                onClick={async () => {
                  try {
                    const r = await syncFeedFn();
                    if (r.status.startsWith("error")) toast.error(r.status);
                    else toast.success(`Checked now: ${r.updated} updated`);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not check now");
                  }
                  await refetchFeed();
                  await queryClient.invalidateQueries({ queryKey: ["grade-items"] });
                }}
              >
                Check now
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full"
                onClick={async () => {
                  if (!window.confirm("Disconnect this link? New grades will stop syncing.")) return;
                  await disconnectFeedFn();
                  await refetchFeed();
                  toast.success("Disconnected");
                }}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Paste your grades link once. It's stored encrypted, checked every 3 hours, and new grades appear here and in the popup.
            </p>
            <div className="mt-3 space-y-2">
              <input
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://…/api/public/v1/grades"
                aria-label="Grades link"
                className="w-full rounded-xl border border-line bg-background px-3 py-2 text-xs text-ink"
              />
              <input
                type="password"
                value={feedKey}
                onChange={(e) => setFeedKey(e.target.value)}
                placeholder="API key (from the app's API link page)"
                aria-label="API key"
                autoComplete="off"
                className="w-full rounded-xl border border-line bg-background px-3 py-2 text-xs text-ink"
              />
              <p className="text-[11px] text-ink-soft">
                Sent as <span className="font-mono">Authorization: Bearer &lt;key&gt;</span>. Stored encrypted.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="rounded-full"
                disabled={!feedUrl.trim()}
                onClick={async () => {
                  try {
                    const r = await connectFeedFn({ data: { url: feedUrl.trim(), key: feedKey.trim() || undefined } });
                    setFeedUrl("");
                    setFeedKey("");
                    toast.success(`Connected to ${r.host}`);
                    await refetchFeed();
                    await syncFeedFn().catch(() => undefined);
                    await refetchFeed();
                    await queryClient.invalidateQueries({ queryKey: ["grade-items"] });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not connect");
                  }
                }}
              >
                Connect
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
