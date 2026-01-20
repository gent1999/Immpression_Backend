// models/block.js
import mongoose from "mongoose";
const { Schema, Types } = mongoose;

/**
 * Block Schema
 * Represents a blocking relationship between two users.
 * When user A blocks user B:
 * - User A won't see user B's content in their feed
 * - User B's content is instantly hidden from user A
 */
const BlockSchema = new Schema(
  {
    // The user who initiated the block
    blockerUserId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The user who is blocked
    blockedUserId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Optional reason (for internal tracking)
    reason: {
      type: String,
      maxLength: [500, "Reason should be less than 500 characters"],
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * Compound index for efficient queries and uniqueness
 */
BlockSchema.index({ blockerUserId: 1, blockedUserId: 1 }, { unique: true });

/**
 * Prevent users from blocking themselves
 */
BlockSchema.pre("save", function (next) {
  if (this.blockerUserId.equals(this.blockedUserId)) {
    const error = new Error("Users cannot block themselves");
    error.name = "ValidationError";
    return next(error);
  }
  next();
});

/**
 * JSON transform
 */
BlockSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

/**
 * Static: Check if user A has blocked user B
 */
BlockSchema.statics.isBlocked = async function (blockerUserId, blockedUserId) {
  const block = await this.findOne({
    blockerUserId,
    blockedUserId,
  });
  return !!block;
};

/**
 * Static: Get all users blocked by a specific user
 */
BlockSchema.statics.getBlockedUserIds = async function (blockerUserId) {
  const blocks = await this.find({ blockerUserId }).select("blockedUserId");
  return blocks.map((block) => block.blockedUserId);
};

/**
 * Static: Get all users who have blocked a specific user
 */
BlockSchema.statics.getBlockerUserIds = async function (blockedUserId) {
  const blocks = await this.find({ blockedUserId }).select("blockerUserId");
  return blocks.map((block) => block.blockerUserId);
};

/**
 * Static: Check mutual block status
 * Returns object indicating if either user has blocked the other
 */
BlockSchema.statics.getMutualBlockStatus = async function (userIdA, userIdB) {
  const [aBlockedB, bBlockedA] = await Promise.all([
    this.isBlocked(userIdA, userIdB),
    this.isBlocked(userIdB, userIdA),
  ]);
  return {
    aBlockedB,
    bBlockedA,
    anyBlock: aBlockedB || bBlockedA,
  };
};

const Block = mongoose.models.Block || mongoose.model("Block", BlockSchema);

export default Block;
