import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { ISession } from '../models/Session';
import Session from '../models/Session'; // Import the default export
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { SessionAuthResponse, ClientSession } from '../types/secureSession';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ACCESS_TOKEN_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

// Generate secure device ID
const generateDeviceId = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Generate session tokens
const generateTokens = (userId: string, sessionId: string) => {
  const payload = { 
    userId, 
    sessionId,
    type: 'access'
  };
  
  const accessToken = jwt.sign(payload, JWT_SECRET, { 
    expiresIn: ACCESS_TOKEN_EXPIRES_IN 
  });
  
  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' }, 
    JWT_SECRET, 
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
  
  return { accessToken, refreshToken };
};

export class SecureSessionController {
  
  // Secure login that returns only session data
  static async secureLogin(req: Request, res: Response) {
    try {
      const { username, password, deviceName } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      // Find user by username or email
      const user = await User.findOne({
        $or: [{ username }, { email: username }]
      }).select('+password'); // Explicitly select password field since it's set to select: false

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!user.password) {
        console.error('User found but no password field:', user.username);
        return res.status(500).json({ error: 'Server configuration error' });
      }

      if (!password) {
        return res.status(400).json({ error: 'Password is required' });
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate device ID and session ID
      const deviceId = generateDeviceId();
      const sessionId = crypto.randomUUID();
      
      // Generate tokens first
      const { accessToken, refreshToken } = generateTokens(user._id.toString(), sessionId);
      
      // Create session
      const session = new Session({
        userId: user._id,
        deviceInfo: {
          deviceId,
          deviceType: 'unknown',
          platform: 'web',
          browser: req.headers['user-agent'] || 'unknown',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          lastActive: new Date()
        },
        token: accessToken,
        isActive: true,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });

      await session.save();

      // Note: tokens are stored server-side in the session, not returned to client

      // Return only session data and minimal user info
      const response: SessionAuthResponse = {
        sessionId: (session._id as mongoose.Types.ObjectId).toString(), // Use the MongoDB _id as sessionId
        deviceId,
        expiresAt: session.expiresAt.toISOString(),
        user: {
          id: user._id.toString(),
          username: user.username,
          avatar: user.avatar
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Secure login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get full user data by session
  static async getUserBySession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Find active session using MongoDB _id
      const session = await Session.findOne({
        _id: sessionId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      });

      if (!session) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // Get user data
      const user = await User.findById(session.userId).select('-password');
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update last activity
      session.deviceInfo.lastActive = new Date();
      await session.save();

      res.json({ user });
    } catch (error) {
      console.error('Get user by session error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get access token by session (for API calls)
  static async getTokenBySession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      console.log('[getTokenBySession] Received sessionId:', sessionId);

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Find active session using MongoDB _id
      const session = await Session.findOne({
        _id: sessionId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      });

      console.log('[getTokenBySession] Found session:', !!session);
      if (session) {
        console.log('[getTokenBySession] Session details:', {
          id: session._id,
          userId: session.userId,
          isActive: session.isActive,
          expiresAt: session.expiresAt
        });
      }

      if (!session) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // Check if token is still valid
      try {
        jwt.verify(session.token, JWT_SECRET);
        
        // Update last activity
        session.deviceInfo.lastActive = new Date();
        await session.save();
        
        return res.json({ 
          accessToken: session.token,
          expiresAt: session.expiresAt 
        });
      } catch (tokenError) {
        // Token expired, generate new one
        try {
          // Generate new token
          const { accessToken } = generateTokens(
            session.userId.toString(), 
            sessionId
          );
          
          // Update session with new token
          session.token = accessToken;
          session.deviceInfo.lastActive = new Date();
          await session.save();
          
          return res.json({ 
            accessToken,
            expiresAt: session.expiresAt 
          });
        } catch (refreshError) {
          // Token expired and cannot be refreshed, invalidate session
          session.isActive = false;
          await session.save();
          
          return res.status(401).json({ error: 'Session expired' });
        }
      }
    } catch (error) {
      console.error('Get token by session error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get user sessions
  static async getUserSessions(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Find current session to get user ID using MongoDB _id
      const currentSession = await Session.findOne({
        _id: sessionId,
        isActive: true
      });

      if (!currentSession) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      // Get all active sessions for this user
      const sessions = await Session.find({
        userId: currentSession.userId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      }).select('deviceInfo token isActive expiresAt');

      const clientSessions: ClientSession[] = sessions.map((session: ISession) => ({
        sessionId: (session._id as any).toString(),
        deviceId: session.deviceInfo.deviceId,
        deviceName: 'web', // We don't have deviceName in our schema, use a default
        isActive: (session._id as any).toString() === sessionId
      }));

      res.json({ sessions: clientSessions });
    } catch (error) {
      console.error('Get user sessions error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Logout specific session
  static async logoutSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { targetSessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Find current session to verify user using MongoDB _id
      const currentSession = await Session.findOne({
        _id: sessionId,
        isActive: true
      });

      if (!currentSession) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      // Logout target session (default to current session)
      const targetId = targetSessionId || sessionId;
      
      await Session.updateOne(
        { 
          _id: targetId,
          userId: currentSession.userId 
        },
        { 
          isActive: false,
          loggedOutAt: new Date()
        }
      );

      res.json({ message: 'Session logged out successfully' });
    } catch (error) {
      console.error('Logout session error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Logout all sessions for user
  static async logoutAllSessions(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Find current session to get user ID using MongoDB _id
      const currentSession = await Session.findOne({
        _id: sessionId,
        isActive: true
      });

      if (!currentSession) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      // Logout all sessions for this user
      await Session.updateMany(
        { 
          userId: currentSession.userId,
          isActive: true
        },
        { 
          isActive: false,
          loggedOutAt: new Date()
        }
      );

      res.json({ message: 'All sessions logged out successfully' });
    } catch (error) {
      console.error('Logout all sessions error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Validate session
  static async validateSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      // Find active session using MongoDB _id
      const session = await Session.findOne({
        _id: sessionId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      });

      if (!session) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // Update last activity
      session.deviceInfo.lastActive = new Date();
      await session.save();

      res.json({ 
        valid: true,
        expiresAt: session.expiresAt,
        lastActivity: session.deviceInfo.lastActive
      });
    } catch (error) {
      console.error('Validate session error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
