// routes/reportRoutes/reportRoutes.js
import express from "express";
import mongoose from "mongoose";
import Report, {
  REPORT_REASON,
  REPORT_STATUS,
  REPORT_TARGET_TYPE,
} from "../../models/report.js";
import ImageModel from "../../models/images.js";
import UserModel from "../../models/users.js";
import { isUserAuthorized } from "../../utils/authUtils.js";

const router = express.Router();

/**
 * POST /reports/image/:imageId
 * Report an image for objectionable content
 */
router.post("/image/:imageId", isUserAuthorized, async (req, res) => {
  try {
    const { imageId } = req.params;
    const { reason, description } = req.body;
    const reporterId = req.user._id;

    // Validate imageId
    if (!mongoose.isValidObjectId(imageId)) {
      return res.status(400).json({ success: false, error: "Invalid image ID" });
    }

    // Validate reason
    if (!reason || !Object.values(REPORT_REASON).includes(reason)) {
      return res.status(400).json({
        success: false,
        error: "Invalid report reason",
        validReasons: Object.values(REPORT_REASON),
      });
    }

    // Find the image
    const image = await ImageModel.findById(imageId).populate("userId", "name email");
    if (!image) {
      return res.status(404).json({ success: false, error: "Image not found" });
    }

    // Prevent self-reporting
    if (image.userId._id.equals(reporterId)) {
      return res.status(400).json({
        success: false,
        error: "You cannot report your own content",
      });
    }

    // Check for duplicate report (same reporter, same target, within 24 hours)
    const existingReport = await Report.findOne({
      reporterUserId: reporterId,
      targetImageId: imageId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (existingReport) {
      return res.status(409).json({
        success: false,
        error: "You have already reported this content recently",
      });
    }

    // Create the report with content snapshot
    const report = await Report.create({
      reporterUserId: reporterId,
      targetType: REPORT_TARGET_TYPE.IMAGE,
      targetImageId: imageId,
      targetUserId: image.userId._id,
      reason,
      description: description || "",
      contentSnapshot: {
        imageLink: image.imageLink,
        imageName: image.name,
        imageDescription: image.description,
        userName: image.userId.name,
        userEmail: image.userId.email,
      },
    });

    res.status(201).json({
      success: true,
      message: "Report submitted successfully. Our team will review it within 24 hours.",
      data: {
        reportId: report._id,
        status: report.status,
      },
    });
  } catch (error) {
    console.error("POST /reports/image/:imageId error:", error);
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * POST /reports/user/:userId
 * Report a user for objectionable behavior
 */
router.post("/user/:userId", isUserAuthorized, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, description } = req.body;
    const reporterId = req.user._id;

    // Validate userId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, error: "Invalid user ID" });
    }

    // Validate reason
    if (!reason || !Object.values(REPORT_REASON).includes(reason)) {
      return res.status(400).json({
        success: false,
        error: "Invalid report reason",
        validReasons: Object.values(REPORT_REASON),
      });
    }

    // Find the user being reported
    const targetUser = await UserModel.findById(userId).select("name email");
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Prevent self-reporting
    if (targetUser._id.equals(reporterId)) {
      return res.status(400).json({
        success: false,
        error: "You cannot report yourself",
      });
    }

    // Check for duplicate report (same reporter, same target, within 24 hours)
    const existingReport = await Report.findOne({
      reporterUserId: reporterId,
      targetUserId: userId,
      targetType: REPORT_TARGET_TYPE.USER,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (existingReport) {
      return res.status(409).json({
        success: false,
        error: "You have already reported this user recently",
      });
    }

    // Create the report with user snapshot
    const report = await Report.create({
      reporterUserId: reporterId,
      targetType: REPORT_TARGET_TYPE.USER,
      targetUserId: userId,
      reason,
      description: description || "",
      contentSnapshot: {
        userName: targetUser.name,
        userEmail: targetUser.email,
      },
    });

    res.status(201).json({
      success: true,
      message: "Report submitted successfully. Our team will review it within 24 hours.",
      data: {
        reportId: report._id,
        status: report.status,
      },
    });
  } catch (error) {
    console.error("POST /reports/user/:userId error:", error);
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * GET /reports/my-reports
 * Get reports submitted by the current user
 */
router.get("/my-reports", isUserAuthorized, async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const skip = (pageNum - 1) * limitNum;

    const [reports, total] = await Promise.all([
      Report.find({ reporterUserId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select("targetType reason status createdAt resolvedAt contentSnapshot")
        .lean(),
      Report.countDocuments({ reporterUserId: req.user._id }),
    ]);

    res.json({
      success: true,
      data: {
        reports,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("GET /reports/my-reports error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * GET /reports/reasons
 * Get list of valid report reasons (for client-side dropdown)
 */
router.get("/reasons", async (_req, res) => {
  const reasons = Object.entries(REPORT_REASON).map(([key, value]) => ({
    key,
    value,
    label: key.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
  }));
  res.json({ success: true, data: reasons });
});

export default router;
