// routes/admin-userAuthRoutes/admin-analyticsRoutes.js
// Uses GA4 Data API via REST (not gRPC) — compatible with Vercel serverless.
// Required env vars:
//   GA4_PROPERTY_ID          — numeric GA4 property ID (e.g. "531614205")
//   GA4_SERVICE_ACCOUNT_JSON — full JSON string of service account key file

import express from "express";
import { GoogleAuth } from "google-auth-library";
import { isAdminAuthorized } from "../../utils/authUtils.js";

const router = express.Router();

async function getAccessToken() {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GA4_SERVICE_ACCOUNT_JSON not set");

  const credentials = JSON.parse(raw);
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function runReport(propertyId, accessToken, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `GA4 API error ${res.status}`);
  }
  return res.json();
}

// GET /api/admin/analytics/web
router.get("/", isAdminAuthorized, async (_req, res) => {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      return res.status(503).json({ success: false, error: "GA4_PROPERTY_ID not set" });
    }

    const token = await getAccessToken();

    const [summary30, summary7, dailyRes, topPagesRes, sourcesRes] = await Promise.all([
      runReport(propertyId, token, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      }),
      runReport(propertyId, token, {
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
        ],
      }),
      runReport(propertyId, token, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      runReport(propertyId, token, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
      runReport(propertyId, token, {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "sessionDefaultChannelGrouping" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 8,
      }),
    ]);

    const mv30 = summary30.rows?.[0]?.metricValues ?? [];
    const mv7  = summary7.rows?.[0]?.metricValues ?? [];

    const daily = (dailyRes.rows ?? []).map((row) => {
      const raw = row.dimensionValues[0].value; // "20250401"
      return {
        date: `${raw.slice(4, 6)}/${raw.slice(6, 8)}`,
        pageViews: parseInt(row.metricValues[0].value || 0),
        users: parseInt(row.metricValues[1].value || 0),
      };
    });

    const topPages = (topPagesRes.rows ?? []).map((row) => ({
      path: row.dimensionValues[0].value,
      title: row.dimensionValues[1].value,
      pageViews: parseInt(row.metricValues[0].value || 0),
      users: parseInt(row.metricValues[1].value || 0),
    }));

    const sources = (sourcesRes.rows ?? []).map((row) => ({
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
    console.error("GA4 analytics error:", err.message);
    return res.status(500).json({ success: false, error: err.message || "Failed to fetch analytics data." });
  }
});

export default router;
