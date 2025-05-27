import mongoose, { Document, Schema } from "mongoose";

export interface ISession extends Document {
  userId: mongoose.Types.ObjectId;
  deviceInfo: {
    deviceId: string;
    deviceType: string;
    platform: string;
    browser?: string;
    os?: string;
    lastActive: Date;
    ipAddress?: string;
    userAgent?: string;
  };
  token: string;
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    deviceInfo: {
      deviceId: { type: String, required: true },
      deviceType: { type: String, required: true },
      platform: { type: String, required: true },
      browser: String,
      os: String,
      lastActive: { type: Date, default: Date.now },
      ipAddress: String,
      userAgent: String,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for quick lookups and session management
SessionSchema.index({ userId: 1, "deviceInfo.deviceId": 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Update lastActive timestamp on session access
SessionSchema.methods.updateLastActive = async function() {
  this.deviceInfo.lastActive = new Date();
  await this.save();
};

export default mongoose.model<ISession>("Session", SessionSchema); 