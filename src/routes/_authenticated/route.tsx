import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { MeroFloating } from "@/components/MeroFloating";
import { NotificationBell } from "@/components/NotificationBell";
import { SettingsDialog } from "@/components/SettingsDialog";
import { GradePopup } from "@/components/GradePopup";
import { ThemeApplier } from "@/components/ThemeApplier";
import { WelcomeTour } from "@/components/WelcomeTour";
import { useUserSettings } from "@/lib/useUserSettings";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: AppLayout,
});

function SignOut() {
  const navigate = useNavigate();
  const { queryClient } = useRouteContext({ from: "__root__" });
  return (
    <button
      type="button"
      className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:text-ink"
      onClick={async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
      }}
    >
      Sign out
    </button>
  );
}

const navItems = [
  { to: "/", label: "Today" },
  { to: "/german", label: "German" },
  { to: "/uni", label: "University" },
];

function AppLayout() {
  const { settings } = useUserSettings();
  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-40 border-b border-line bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3 sm:px-8">
          <Link to="/" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rust">
            Ritual
          </Link>
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                label={item.to === "/german" ? settings.habit_page_name : item.label}
              />
            ))}
            <NotificationBell />
            <SettingsDialog />
            <SignOut />
          </div>
        </div>
      </nav>
      <Outlet />
      <MeroFloating />
      <ThemeApplier />
      <GradePopup />
      <WelcomeTour />
    </div>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      activeProps={{
        className: "bg-cream text-ink ring-1 ring-black/5",
      }}
      className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:text-ink"
    >
      {label}
    </Link>
  );
}
