import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled hourly job (see docs/notification-schedule.sql): pushes a reminder for every
 * deadline inside its reminder window (quizzes 2 days before, assignments 1 day before)
 * that has not been reminded yet. Only runs with the scheduler's secret.
 */
export const Route = createFileRoute("/api/public/jobs/send-deadline-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { cronAuthFailure, sendDueDeadlineReminders } = await import(
          "@/lib/deadline-push.server"
        );
        const authFailure = await cronAuthFailure(request);
        if (authFailure) return authFailure;

        const result = await sendDueDeadlineReminders();
        return Response.json({ success: true, ...result });
      },
    },
  },
});
