import "server-only";
import { BRAND } from "@/lib/brand";

export interface DailyClientReportStats {
  clientName: string;
  day: string; // YYYY-MM-DD
  agentsActive: number;
  callsAttempted: number;
  connects: number;
  talkMinutes: number;
  wrapMinutes: number;
  attendanceMinutes: number;
  productiveMinutes: number;
}

function fmtHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}

// Deliberately no agent name anywhere in this template — same "aggregate
// only" boundary as the client dashboard (src/app/(app)/client/page.tsx).
// This is the daily counterpart to that page: same numbers, pushed to the
// client's inbox instead of requiring a login.
export function renderDailyClientReportEmail(stats: DailyClientReportStats) {
  const dashboardUrl = `${process.env.APP_BASE_URL ?? "https://app.example.com"}/client`;
  const subject = `Daily update — ${stats.clientName} — ${stats.day}`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin: 0 0 4px;">Daily update — ${stats.clientName}</h2>
      <p style="margin: 0 0 20px; color: #666; font-size: 13px;">${stats.day}</p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 10px; background: #f5f5f5; border-radius: 6px 0 0 6px;">
            <div style="font-size: 11px; color: #666; text-transform: uppercase;">Time worked</div>
            <div style="font-size: 20px; font-weight: 600;">${fmtHours(stats.attendanceMinutes)}</div>
          </td>
          <td style="width: 8px;"></td>
          <td style="padding: 10px; background: #f5f5f5; border-radius: 0 6px 6px 0;">
            <div style="font-size: 11px; color: #666; text-transform: uppercase;">Calls made</div>
            <div style="font-size: 20px; font-weight: 600;">${stats.callsAttempted}</div>
          </td>
        </tr>
      </table>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 6px 0; color: #666;">Connected calls</td><td style="padding: 6px 0; text-align: right;">${stats.connects}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Talk time</td><td style="padding: 6px 0; text-align: right;">${fmtHours(stats.talkMinutes)}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Wrap time</td><td style="padding: 6px 0; text-align: right;">${fmtHours(stats.wrapMinutes)}</td></tr>
      </table>

      <p style="margin: 20px 0 0; font-size: 13px;">
        <a href="${dashboardUrl}" style="color: #2563eb;">View the full dashboard →</a>
      </p>

      <p style="margin: 24px 0 0; font-size: 11px; color: #999;">
        Aggregate totals only — sent automatically by ${BRAND.productName}.
      </p>
    </div>
  `.trim();

  const text = [
    `Daily update — ${stats.clientName} — ${stats.day}`,
    ``,
    `Time worked: ${fmtHours(stats.attendanceMinutes)}`,
    `Calls made: ${stats.callsAttempted}`,
    `Connected calls: ${stats.connects}`,
    `Talk time: ${fmtHours(stats.talkMinutes)}`,
    `Wrap time: ${fmtHours(stats.wrapMinutes)}`,
    ``,
    `Full dashboard: ${dashboardUrl}`,
  ].join("\n");

  return { subject, html, text };
}
