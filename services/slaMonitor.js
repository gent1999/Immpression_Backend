// services/slaMonitor.js
/**
 * SLA Monitor Service
 * Monitors reports approaching their 24-hour SLA deadline
 * and sends alerts to administrators.
 */

import Report, { REPORT_STATUS } from "../models/report.js";
import sendEmail from "./email.js";

const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || "admin@immpression.com";
const APP_NAME = process.env.APP_NAME || "Immpression";

// Track which reports we've already alerted about to avoid spam
const alertedReports = new Set();

/**
 * Build HTML email for SLA alerts
 */
function buildSLAAlertEmail(reports, isUrgent = false) {
  const urgencyLabel = isUrgent ? "URGENT: " : "";
  const reportRows = reports
    .map(
      (r) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd">${r._id}</td>
        <td style="padding:8px;border:1px solid #ddd">${r.reason}</td>
        <td style="padding:8px;border:1px solid #ddd">${r.targetType}</td>
        <td style="padding:8px;border:1px solid #ddd">${formatTimeRemaining(r.slaDeadline)}</td>
        <td style="padding:8px;border:1px solid #ddd">${new Date(r.createdAt).toLocaleString()}</td>
      </tr>
    `
    )
    .join("");

  return `
    <!doctype html>
    <html>
    <head><meta charset="utf-8"/></head>
    <body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f7f7f7">
      <div style="max-width:700px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden">
        <div style="background:${isUrgent ? "#dc3545" : "#ffc107"};padding:16px;color:${isUrgent ? "#fff" : "#000"}">
          <h2 style="margin:0">${urgencyLabel}SLA Alert - Reports Requiring Attention</h2>
        </div>
        <div style="padding:20px">
          <p>The following reports are ${isUrgent ? "about to breach" : "approaching"} the 24-hour SLA deadline:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <thead>
              <tr style="background:#f5f5f5">
                <th style="padding:8px;border:1px solid #ddd;text-align:left">Report ID</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:left">Reason</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:left">Type</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:left">Time Remaining</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:left">Submitted</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows}
            </tbody>
          </table>
          <p style="margin-top:20px">
            <a href="${process.env.ADMIN_PANEL_URL || "https://immpression-admin.vercel.app"}/reports"
               style="display:inline-block;padding:12px 24px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:6px">
              View Reports Dashboard
            </a>
          </p>
          <p style="color:#666;font-size:12px;margin-top:24px">
            Apple App Store Guideline 1.2 requires that user reports be addressed within 24 hours.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Format time remaining in human-readable format
 */
function formatTimeRemaining(deadline) {
  const remaining = new Date(deadline).getTime() - Date.now();
  if (remaining <= 0) return "OVERDUE";

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Check for reports approaching SLA deadline and send alerts
 */
async function checkSLADeadlines() {
  try {
    const now = new Date();
    const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const oneHourFromNow = new Date(Date.now() + 1 * 60 * 60 * 1000);

    // Find reports at risk (< 4 hours remaining)
    const atRiskReports = await Report.find({
      status: { $in: [REPORT_STATUS.PENDING, REPORT_STATUS.UNDER_REVIEW] },
      slaDeadline: { $lte: fourHoursFromNow, $gt: now },
    })
      .sort({ slaDeadline: 1 })
      .lean();

    // Mark SLA breached reports
    await Report.markBreachedReports();

    // Separate urgent (< 1 hour) from at-risk reports
    const urgentReports = atRiskReports.filter(
      (r) => new Date(r.slaDeadline).getTime() <= oneHourFromNow.getTime()
    );
    const warningReports = atRiskReports.filter(
      (r) => new Date(r.slaDeadline).getTime() > oneHourFromNow.getTime()
    );

    // Send urgent alerts (< 1 hour)
    const newUrgentReports = urgentReports.filter(
      (r) => !alertedReports.has(`urgent-${r._id}`)
    );
    if (newUrgentReports.length > 0) {
      try {
        await sendEmail(
          ADMIN_ALERT_EMAIL,
          `[URGENT] ${APP_NAME}: ${newUrgentReports.length} report(s) about to breach SLA`,
          buildSLAAlertEmail(newUrgentReports, true)
        );
        newUrgentReports.forEach((r) => alertedReports.add(`urgent-${r._id}`));
        console.log(`SLA Monitor: Sent urgent alert for ${newUrgentReports.length} reports`);
      } catch (emailError) {
        console.error("SLA Monitor: Failed to send urgent alert email:", emailError);
      }
    }

    // Send warning alerts (1-4 hours) - only once per report
    const newWarningReports = warningReports.filter(
      (r) => !alertedReports.has(`warning-${r._id}`)
    );
    if (newWarningReports.length > 0) {
      try {
        await sendEmail(
          ADMIN_ALERT_EMAIL,
          `[Warning] ${APP_NAME}: ${newWarningReports.length} report(s) approaching SLA deadline`,
          buildSLAAlertEmail(newWarningReports, false)
        );
        newWarningReports.forEach((r) => alertedReports.add(`warning-${r._id}`));
        console.log(`SLA Monitor: Sent warning alert for ${newWarningReports.length} reports`);
      } catch (emailError) {
        console.error("SLA Monitor: Failed to send warning alert email:", emailError);
      }
    }

    // Clean up old entries from alertedReports (resolved reports)
    const resolvedReportIds = new Set(
      await Report.find({
        status: { $in: [REPORT_STATUS.RESOLVED, REPORT_STATUS.DISMISSED] },
      })
        .select("_id")
        .lean()
        .then((reports) => reports.map((r) => r._id.toString()))
    );

    for (const key of alertedReports) {
      const reportId = key.split("-")[1];
      if (resolvedReportIds.has(reportId)) {
        alertedReports.delete(key);
      }
    }

    return {
      atRisk: atRiskReports.length,
      urgent: urgentReports.length,
      alertsSent: newUrgentReports.length + newWarningReports.length,
    };
  } catch (error) {
    console.error("SLA Monitor error:", error);
    return { error: error.message };
  }
}

/**
 * Start the SLA monitoring interval
 * Runs every 15 minutes by default
 */
let monitorInterval = null;

export function startSLAMonitor(intervalMinutes = 15) {
  if (monitorInterval) {
    console.log("SLA Monitor: Already running");
    return;
  }

  console.log(`SLA Monitor: Starting with ${intervalMinutes} minute interval`);

  // Run immediately on start
  checkSLADeadlines().then((result) => {
    console.log("SLA Monitor: Initial check complete", result);
  });

  // Then run on interval
  monitorInterval = setInterval(
    () => {
      checkSLADeadlines().then((result) => {
        if (result.alertsSent > 0) {
          console.log(`SLA Monitor: Check complete, ${result.alertsSent} alerts sent`);
        }
      });
    },
    intervalMinutes * 60 * 1000
  );
}

export function stopSLAMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("SLA Monitor: Stopped");
  }
}

export { checkSLADeadlines };

export default {
  startSLAMonitor,
  stopSLAMonitor,
  checkSLADeadlines,
};
