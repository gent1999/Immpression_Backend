import AdminSettings from "../models/adminSettings.js";
import sendEmail from "./email.js";

/**
 * Send an admin notification email if the relevant toggle is enabled.
 * Fire-and-forget — never throws, so callers don't need try/catch.
 *
 * @param {"newSignup"|"newPendingArtwork"|"newReport"} event
 * @param {object} data  - context fields used to build the email body
 */
export async function notifyAdmins(event, data = {}) {
  try {
    const settings = await AdminSettings.findOne({ _singleton: true }).lean();
    if (!settings) return;

    const { notifications, notificationEmails } = settings;
    if (!notificationEmails?.length) return;
    if (!notifications?.[event]) return;

    let subject = "";
    let html = "";

    if (event === "newSignup") {
      subject = "New User Signup — Immpression";
      html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
          <h2 style="color:#0f172a">New User Signed Up</h2>
          <p><strong>Name:</strong> ${data.name || "—"}</p>
          <p><strong>Email:</strong> ${data.email || "—"}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          <hr/>
          <p style="color:#94a3b8;font-size:12px">Immpression Admin Notifications</p>
        </div>`;
    } else if (event === "newPendingArtwork") {
      subject = "New Artwork Pending Review — Immpression";
      html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
          <h2 style="color:#0f172a">New Artwork Submitted</h2>
          <p><strong>Title:</strong> ${data.name || "—"}</p>
          <p><strong>Artist:</strong> ${data.artistName || "—"}</p>
          <p><strong>Price:</strong> $${data.price || "—"}</p>
          <p><strong>Category:</strong> ${data.category || "—"}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          <hr/>
          <p style="color:#94a3b8;font-size:12px">Immpression Admin Notifications</p>
        </div>`;
    } else if (event === "newReport") {
      subject = "New Report Filed — Immpression";
      html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
          <h2 style="color:#0f172a">New Report Filed</h2>
          <p><strong>Type:</strong> ${data.targetType || "—"}</p>
          <p><strong>Reason:</strong> ${(data.reason || "—").replace(/_/g, " ")}</p>
          <p><strong>Reporter:</strong> ${data.reporterEmail || "—"}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          <hr/>
          <p style="color:#94a3b8;font-size:12px">Immpression Admin Notifications</p>
        </div>`;
    } else {
      return;
    }

    await Promise.all(
      notificationEmails.map((email) => sendEmail(email, subject, html))
    );
  } catch (e) {
    console.error("notifyAdmins error:", e);
  }
}
