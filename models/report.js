// models/report.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

/**
 * Report Reasons - categorized for Apple compliance
 */
export const REPORT_REASON = {
  // Content-related
  INAPPROPRIATE_CONTENT: "inappropriate_content",
  NUDITY_SEXUAL: "nudity_sexual",
  VIOLENCE_GRAPHIC: "violence_graphic",
  HATE_SPEECH: "hate_speech",

  // IP/Legal
  COPYRIGHT_VIOLATION: "copyright_violation",
  TRADEMARK_VIOLATION: "trademark_violation",

  // Behavior-related
  HARASSMENT: "harassment",
  SPAM: "spam",
  SCAM_FRAUD: "scam_fraud",
  IMPERSONATION: "impersonation",

  // Other
  OTHER: "other",
};

const REASON_ENUM = {
  values: Object.values(REPORT_REASON),
  message: "Invalid report reason",
};

/**
 * Report Status - for tracking moderation workflow
 */
export const REPORT_STATUS = {
  PENDING: "pending",           // Newly submitted, awaiting review
  UNDER_REVIEW: "under_review", // Admin is reviewing
  RESOLVED: "resolved",         // Action taken or dismissed
  DISMISSED: "dismissed",       // Report was invalid/unfounded
};

const STATUS_ENUM = {
  values: Object.values(REPORT_STATUS),
  message: "Invalid report status",
};

/**
 * Report Target Type
 */
export const REPORT_TARGET_TYPE = {
  IMAGE: "image",
  USER: "user",
};

const TARGET_TYPE_ENUM = {
  values: Object.values(REPORT_TARGET_TYPE),
  message: "Target type must be 'image' or 'user'",
};

/**
 * Resolution Actions taken
 */
export const RESOLUTION_ACTION = {
  NO_ACTION: "no_action",          // Report dismissed, no violation
  WARNING_ISSUED: "warning_issued", // User warned
  CONTENT_REMOVED: "content_removed", // Image/content removed
  USER_SUSPENDED: "user_suspended", // Temporary suspension
  USER_BANNED: "user_banned",       // Permanent ban
};

/**
 * Report Schema
 */
const ReportSchema = new Schema(
  {
    // Who submitted the report
    reporterUserId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // What is being reported
    targetType: {
      type: String,
      enum: TARGET_TYPE_ENUM,
      required: true,
    },

    // The reported content/user
    targetImageId: {
      type: Types.ObjectId,
      ref: "Image",
      index: true,
    },
    targetUserId: {
      type: Types.ObjectId,
      ref: "User",
      index: true,
    },

    // Report details
    reason: {
      type: String,
      enum: REASON_ENUM,
      required: true,
    },
    description: {
      type: String,
      maxLength: [1000, "Description should be less than 1000 characters"],
      default: "",
    },

    // Status tracking
    status: {
      type: String,
      enum: STATUS_ENUM,
      default: REPORT_STATUS.PENDING,
      index: true,
    },

    // SLA tracking (Apple requires 24-hour response)
    slaDeadline: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: true,
    },
    slaBreached: {
      type: Boolean,
      default: false,
    },

    // Resolution details
    resolvedAt: { type: Date, default: null },
    resolvedByAdminId: {
      type: Types.ObjectId,
      ref: "AdminUser",
    },
    resolutionAction: {
      type: String,
      enum: Object.values(RESOLUTION_ACTION),
    },
    resolutionNotes: {
      type: String,
      maxLength: [2000, "Resolution notes should be less than 2000 characters"],
    },

    // Snapshot of reported content (in case it gets deleted)
    contentSnapshot: {
      imageLink: String,
      imageName: String,
      imageDescription: String,
      userName: String,
      userEmail: String,
    },
  },
  { timestamps: true }
);

/**
 * Indexes for efficient querying
 */
ReportSchema.index({ status: 1, slaDeadline: 1 });
ReportSchema.index({ targetUserId: 1, status: 1 });
ReportSchema.index({ reporterUserId: 1, createdAt: -1 });

/**
 * Pre-save hook: Set SLA deadline (24 hours from creation)
 */
ReportSchema.pre("save", function (next) {
  if (this.isNew && !this.slaDeadline) {
    this.slaDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  next();
});

/**
 * Virtual: Time remaining until SLA breach
 */
ReportSchema.virtual("slaTimeRemaining").get(function () {
  if (this.status === REPORT_STATUS.RESOLVED || this.status === REPORT_STATUS.DISMISSED) {
    return null;
  }
  const remaining = this.slaDeadline.getTime() - Date.now();
  return remaining > 0 ? remaining : 0;
});

/**
 * Virtual: Is SLA at risk (less than 4 hours remaining)
 */
ReportSchema.virtual("slaAtRisk").get(function () {
  const fourHours = 4 * 60 * 60 * 1000;
  return this.slaTimeRemaining !== null && this.slaTimeRemaining < fourHours;
});

/**
 * JSON transform
 */
ReportSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

/**
 * Static: Get pending reports count
 */
ReportSchema.statics.getPendingCount = async function () {
  return this.countDocuments({ status: REPORT_STATUS.PENDING });
};

/**
 * Static: Get reports at SLA risk
 */
ReportSchema.statics.getAtRiskReports = async function () {
  const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return this.find({
    status: { $in: [REPORT_STATUS.PENDING, REPORT_STATUS.UNDER_REVIEW] },
    slaDeadline: { $lte: fourHoursFromNow },
    slaBreached: false,
  }).sort({ slaDeadline: 1 });
};

/**
 * Static: Mark SLA breached reports
 */
ReportSchema.statics.markBreachedReports = async function () {
  const now = new Date();
  return this.updateMany(
    {
      status: { $in: [REPORT_STATUS.PENDING, REPORT_STATUS.UNDER_REVIEW] },
      slaDeadline: { $lt: now },
      slaBreached: false,
    },
    { $set: { slaBreached: true } }
  );
};

const Report = mongoose.models.Report || mongoose.model("Report", ReportSchema);

export default Report;
