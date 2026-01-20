// routes/blockRoutes/blockRoutes.js
import express from "express";
import mongoose from "mongoose";
import Block from "../../models/block.js";
import UserModel from "../../models/users.js";
import { isUserAuthorized } from "../../utils/authUtils.js";

const router = express.Router();

/**
 * POST /blocks/:userId
 * Block a user - their content will be immediately hidden from the blocker's feed
 */
router.post("/:userId", isUserAuthorized, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const blockerUserId = req.user._id;

    // Validate userId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, error: "Invalid user ID" });
    }

    // Prevent self-blocking
    if (blockerUserId.equals(userId)) {
      return res.status(400).json({
        success: false,
        error: "You cannot block yourself",
      });
    }

    // Verify target user exists
    const targetUser = await UserModel.findById(userId).select("name");
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Check if already blocked
    const existingBlock = await Block.findOne({
      blockerUserId,
      blockedUserId: userId,
    });

    if (existingBlock) {
      return res.status(409).json({
        success: false,
        error: "You have already blocked this user",
      });
    }

    // Create the block
    const block = await Block.create({
      blockerUserId,
      blockedUserId: userId,
      reason: reason || null,
    });

    res.status(201).json({
      success: true,
      message: `${targetUser.name || "User"} has been blocked. Their content will no longer appear in your feed.`,
      data: {
        blockId: block._id,
        blockedUserId: userId,
      },
    });
  } catch (error) {
    console.error("POST /blocks/:userId error:", error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "You have already blocked this user",
      });
    }
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * DELETE /blocks/:userId
 * Unblock a user
 */
router.delete("/:userId", isUserAuthorized, async (req, res) => {
  try {
    const { userId } = req.params;
    const blockerUserId = req.user._id;

    // Validate userId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, error: "Invalid user ID" });
    }

    // Find and delete the block
    const result = await Block.findOneAndDelete({
      blockerUserId,
      blockedUserId: userId,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Block not found. This user is not blocked.",
      });
    }

    res.json({
      success: true,
      message: "User has been unblocked",
      data: {
        unblockedUserId: userId,
      },
    });
  } catch (error) {
    console.error("DELETE /blocks/:userId error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * GET /blocks
 * Get list of users blocked by the current user
 */
router.get("/", isUserAuthorized, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const skip = (pageNum - 1) * limitNum;

    const [blocks, total] = await Promise.all([
      Block.find({ blockerUserId: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("blockedUserId", "name profilePictureLink")
        .lean(),
      Block.countDocuments({ blockerUserId: req.user._id }),
    ]);

    // Transform to include user info directly
    const blockedUsers = blocks.map((block) => ({
      blockId: block._id,
      userId: block.blockedUserId?._id,
      name: block.blockedUserId?.name || "Unknown User",
      profilePictureLink: block.blockedUserId?.profilePictureLink,
      blockedAt: block.createdAt,
    }));

    res.json({
      success: true,
      data: {
        blockedUsers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("GET /blocks error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * GET /blocks/check/:userId
 * Check if a specific user is blocked
 */
router.get("/check/:userId", isUserAuthorized, async (req, res) => {
  try {
    const { userId } = req.params;
    const blockerUserId = req.user._id;

    // Validate userId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, error: "Invalid user ID" });
    }

    // Get mutual block status
    const blockStatus = await Block.getMutualBlockStatus(blockerUserId, userId);

    res.json({
      success: true,
      data: {
        isBlocked: blockStatus.aBlockedB,      // Current user blocked target
        isBlockedBy: blockStatus.bBlockedA,    // Target blocked current user
        anyBlock: blockStatus.anyBlock,        // Either direction
      },
    });
  } catch (error) {
    console.error("GET /blocks/check/:userId error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

/**
 * GET /blocks/ids
 * Get list of blocked user IDs (for efficient feed filtering)
 */
router.get("/ids", isUserAuthorized, async (req, res) => {
  try {
    const blockedIds = await Block.getBlockedUserIds(req.user._id);
    res.json({
      success: true,
      data: blockedIds,
    });
  } catch (error) {
    console.error("GET /blocks/ids error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

export default router;
