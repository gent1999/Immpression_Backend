import mongoose from "mongoose";
const { Schema, Types } = mongoose;

const ProfileViewSchema = new Schema(
  {
    viewerId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    profileId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    viewedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ProfileViewSchema.index({ viewerId: 1, profileId: 1 }, { unique: true });

const ProfileViewModel =
  mongoose.models.ProfileView || mongoose.model("ProfileView", ProfileViewSchema);

export default ProfileViewModel;
