import mongoose from "mongoose";

const adminSettingsSchema = new mongoose.Schema(
  {
    // Singleton — only one document ever exists
    _singleton: { type: Boolean, default: true, unique: true },

    notifications: {
      newSignup:         { type: Boolean, default: false },
      newPendingArtwork: { type: Boolean, default: false },
      newReport:         { type: Boolean, default: false },
    },

    // Admin emails that receive notifications
    notificationEmails: [{ type: String, trim: true, lowercase: true }],
  },
  { timestamps: true }
);

export default mongoose.model("AdminSettings", adminSettingsSchema);
