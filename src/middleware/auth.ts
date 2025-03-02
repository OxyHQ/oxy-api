import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Ensure environment variables are loaded
dotenv.config();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

export const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      logger.warn('Auth failed: No token provided');
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.split(' ')[1];
    
    if (!process.env.ACCESS_TOKEN_SECRET) {
      logger.error('ACCESS_TOKEN_SECRET not configured');
      return res.status(500).json({ 
        success: false,
        message: 'Server configuration error',
        code: 'CONFIG_ERROR'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET) as { id: string };
      const user = await User.findById(decoded.id).select('+refreshToken');
      
      if (!user) {
        logger.warn(`Auth failed: User not found for id ${decoded.id}`);
        return res.status(401).json({ 
          success: false,
          message: 'Invalid session',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!user.refreshToken) {
        logger.warn(`Auth failed: No refresh token for user ${decoded.id}`);
        return res.status(401).json({
          success: false,
          message: 'Session expired',
          code: 'NO_REFRESH_TOKEN'
        });
      }

      req.user = { id: user._id.toString() };
      next();
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ 
          success: false,
          message: 'Session expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      if (jwtError instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ 
          success: false,
          message: 'Invalid session',
          code: 'INVALID_TOKEN'
        });
      }
      throw jwtError;
    }
  } catch (error) {
    logger.error('Unexpected auth error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Authentication error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};