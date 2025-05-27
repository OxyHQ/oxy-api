import Session from "../models/Session";
import { logger } from "./logger";

/**
 * Update session activity for the given token
 * @param token - The session token to update
 */
export const updateSessionActivity = async (token: string): Promise<void> => {
  try {
    if (!token) {
      logger.warn('[SessionUtils] No token provided for activity update');
      return;
    }

    await Session.updateOne(
      { token, isActive: true },
      { 
        $set: { 
          "deviceInfo.lastActive": new Date() 
        },
        $inc: { activityCount: 1 }
      }
    );

    logger.debug(`[SessionUtils] Updated activity for token session`);
  } catch (error) {
    logger.error('[SessionUtils] Failed to update session activity:', error);
  }
};

/**
 * Create a new session for a user
 * @param userId - The user ID
 * @param token - The access token for this session
 * @param deviceInfo - Device information
 * @returns The created session
 */
export const createSession = async (
  userId: string,
  token: string,
  deviceInfo: {
    deviceId?: string;
    deviceType: string;
    platform: string;
    browser?: string;
    os?: string;
    ipAddress?: string;
    userAgent?: string;
    location?: string;
  }
) => {
  try {
    // Calculate expiration date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const sessionData = {
      userId,
      token,
      deviceInfo: {
        ...deviceInfo,
        lastActive: new Date()
      },
      isActive: true,
      expiresAt,
      createdAt: new Date(),
      activityCount: 1
    };

    const session = new Session(sessionData);
    await session.save();
    
    logger.info(`[SessionUtils] Created new session for user: ${userId}`);
    return session;
  } catch (error) {
    logger.error('[SessionUtils] Failed to create session:', error);
    throw error;
  }
};
