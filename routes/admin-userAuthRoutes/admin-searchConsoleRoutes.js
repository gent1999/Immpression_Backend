import express from "express";
import { GoogleAuth } from "google-auth-library";
import { verifyAdminToken } from "./admin-userAuthRoutes.js";

const router = express.Router();

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
const SITE_URL = process.env.GSC_SITE_URL || "https://www.immpression.art/";
const GSC_BASE = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}`;

async function getAccessToken() {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GA4_SERVICE_ACCOUNT_JSON not configured");

  const credentials = JSON.parse(raw);
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");

  const auth = new GoogleAuth({ credentials, scopes: SCOPES });
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  return tokenRes.token;
}

async function querySearchAnalytics(token, body) {
  const res = await fetch(`${GSC_BASE}/searchAnalytics/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GSC API error: ${err}`);
  }
  return res.json();
}

router.get("/", verifyAdminToken, async (req, res) => {
  try {
    const token = await getAccessToken();

    const today = new Date();
    const endDate = today.toISOString().split("T")[0];
    const startDate28 = new Date(today - 28 * 864e5).toISOString().split("T")[0];

    // Run all queries in parallel
    const [summaryData, dailyData, queriesData, pagesData] = await Promise.all([
      // Overall summary
      querySearchAnalytics(token, {
        startDate: startDate28,
        endDate,
        rowLimit: 1,
      }),
      // Daily trend
      querySearchAnalytics(token, {
        startDate: startDate28,
        endDate,
        dimensions: ["date"],
        rowLimit: 28,
      }),
      // Top queries
      querySearchAnalytics(token, {
        startDate: startDate28,
        endDate,
        dimensions: ["query"],
        rowLimit: 10,
        orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
      }),
      // Top pages
      querySearchAnalytics(token, {
        startDate: startDate28,
        endDate,
        dimensions: ["page"],
        rowLimit: 10,
        orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
      }),
    ]);

    // Summary row (aggregate across all rows if no dimensions)
    const totalClicks = summaryData.rows?.reduce((s, r) => s + r.clicks, 0) ?? 0;
    const totalImpressions = summaryData.rows?.reduce((s, r) => s + r.impressions, 0) ?? 0;
    const avgCtr = summaryData.rows?.length
      ? summaryData.rows.reduce((s, r) => s + r.ctr, 0) / summaryData.rows.length
      : 0;
    const avgPosition = summaryData.rows?.length
      ? summaryData.rows.reduce((s, r) => s + r.position, 0) / summaryData.rows.length
      : 0;

    // Daily rows
    const daily = (dailyData.rows || []).map((r) => ({
      date: r.keys[0].slice(5), // MM-DD
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10, // percent with 1dp
      position: Math.round(r.position * 10) / 10,
    }));

    // Top queries
    const topQueries = (queriesData.rows || []).map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: `${Math.round(r.ctr * 1000) / 10}%`,
      position: Math.round(r.position * 10) / 10,
    }));

    // Top pages — strip domain for display
    const topPages = (pagesData.rows || []).map((r) => ({
      page: r.keys[0].replace("https://www.immpression.art", "") || "/",
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: `${Math.round(r.ctr * 1000) / 10}%`,
      position: Math.round(r.position * 10) / 10,
    }));

    res.json({
      success: true,
      data: {
        summary: {
          clicks: totalClicks,
          impressions: totalImpressions,
          ctr: `${Math.round(avgCtr * 1000) / 10}%`,
          position: Math.round(avgPosition * 10) / 10,
        },
        daily,
        topQueries,
        topPages,
      },
    });
  } catch (err) {
    console.error("Search Console error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
