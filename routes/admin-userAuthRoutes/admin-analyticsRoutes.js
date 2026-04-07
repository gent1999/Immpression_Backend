// routes/admin-userAuthRoutes/admin-analyticsRoutes.js
// Fetches GA4 data via the Google Analytics Data API (service account auth).
//
// Required env vars:
//   GA4_PROPERTY_ID          — numeric GA4 property ID (e.g. "376543210")
//   GA4_SERVICE_ACCOUNT_JSON — full JSON string of your service account key file

import express from "express";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { isAdminAuthorized } from "../../utils/authUtils.js";

const router = express.Router();

function getClient() {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GA4_SERVICE_ACCOUNT_JSON not set");
  return new BetaAnalyticsDataClient({ credentials: JSON.parse(raw) });
}

const PROPERTY = () => {
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) throw new Error("GA4_PROPERTY_ID not set");
  return `properties/${id}`;
};

// GET /api/admin/analytics
router.get("/", isAdminAuthorized, async (_req, res) => {
  try {
    const client = getClient();
    const property = PROPERTY();

    const [summary30, summary7, dailyRes, topPagesRes, sourcesRes] = await Promise.all([
      // ── 30-day summary ──────────────────────────────────────────────────
      client.runReport({
        property,
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      }),
      // ── 7-day summary ───────────────────────────────────────────────────
      client.runReport({
        property,
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
        ],
      }),
      // ── Daily chart data (30 days) ──────────────────────────────────────
      client.runReport({
        property,
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      // ── Top 10 pages ────────────────────────────────────────────────────
      client.runReport({
        property,
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
      // ── Traffic sources ─────────────────────────────────────────────────
      client.runReport({
        property,
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "sessionDefaultChannelGrouping" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 8,
      }),
    ]);

    const mv30 = summary30[0].rows?.[0]?.metricValues ?? [];
    const mv7  = summary7[0].rows?.[0]?.metricValues ?? [];

    const daily = (dailyRes[0].rows ?? []).map((row) => {
      const raw = row.dimensionValues[0].value; // "20250401"
      return {
        date: `${raw.slice(4, 6)}/${raw.slice(6, 8)}`,
        pageViews: parseInt(row.metricValues[0].value || 0),
        users: parseInt(row.metricValues[1].value || 0),
      };
    });

    const topPages = (topPagesRes[0].rows ?? []).map((row) => ({
      path: row.dimensionValues[0].value,
      title: row.dimensionValues[1].value,
      pageViews: parseInt(row.metricValues[0].value || 0),
      users: parseInt(row.metricValues[1].value || 0),
    }));

    const sources = (sourcesRes[0].rows ?? []).map((row) => ({
      channel: row.dimensionValues[0].value,
      sessions: parseInt(row.metricValues[0].value || 0),
      users: parseInt(row.metricValues[1].value || 0),
    }));

    const totalSessions = sources.reduce((s, r) => s + r.sessions, 0);
    const sourcesWithPct = sources.map((s) => ({
      ...s,
      pct: totalSessions ? Math.round((s.sessions / totalSessions) * 100) : 0,
    }));

    return res.json({
      success: true,
      data: {
        last30Days: {
          users:              parseInt(mv30[0]?.value || 0),
          sessions:           parseInt(mv30[1]?.value || 0),
          pageViews:          parseInt(mv30[2]?.value || 0),
          bounceRate:         parseFloat(parseFloat(mv30[3]?.value || 0).toFixed(1)),
          avgSessionDuration: Math.round(parseFloat(mv30[4]?.value || 0)),
        },
        last7Days: {
          users:     parseInt(mv7[0]?.value || 0),
          sessions:  parseInt(mv7[1]?.value || 0),
          pageViews: parseInt(mv7[2]?.value || 0),
        },
        daily,
        topPages,
        sources: sourcesWithPct,
      },
    });
  } catch (err) {
    console.error("GA4 analytics error:", err.message, err.code, err.details);
    if (err.message?.includes("not set")) {
      return res.status(503).json({ success: false, error: "Analytics not configured — set GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON in env." });
    }
    return res.status(500).json({ success: false, error: err.message || "Failed to fetch analytics data.", code: err.code, details: err.details });
  }
});

export default router;
