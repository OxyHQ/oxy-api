import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { Document } from 'mongoose';

// Ensure environment variables are loaded
dotenv.config();

/**
 * Interface for requests with full user object
 */
export interface AuthRequest extends Request {
  user?: IUser & Document;
}

/**
 * Interface for requests with just user ID
 */
export interface SimpleAuthRequest extends Request {
  user?: {
    id: string;
  };
}

/**
 * Extract user ID from JWT token
 */
const extractUserIdFromToken = (token: string): string | null => {
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as { id: string };
    return decoded.id || null;
  } catch (error) {
    logger.error('Error extracting user ID from token:', error);
    return null;
  }
};

/**
 * Authentication middleware that validates JWT tokens and attaches the full user object to the request
 * Use this when you need the complete user profile in your route handler
 */
export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authorization header found'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Invalid authentication format',
        message: 'Authorization header must start with Bearer'
      });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'No token provided in authorization header'
      });
    }

    if (!process.env.ACCESS_TOKEN_SECRET) {
      logger.error('ACCESS_TOKEN_SECRET not configured');
      return res.status(500).json({ 
        success: false,
        message: 'Server configuration error',
        code: 'CONFIG_ERROR'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET) as { id: string };
      
      if (!decoded.id) {
        logger.warn('Auth failed: No user ID in token');
        return res.status(401).json({
          error: 'Invalid token',
          message: 'User ID not found in token'
        });
      }
      
      // Get user from database
      const user = await User.findById(decoded.id).select('+refreshToken');
      
      if (!user) {
        logger.warn(`Auth failed: User not found for id ${decoded.id}`);
        return res.status(401).json({
          error: 'Invalid token',
          message: 'User not found'
        });
      }

      // Set user in request
      req.user = user;
      
      next();
    } catch (error) {
      logger.error('Token verification error:', error);
      
      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Your session has expired. Please log in again.'
        });
      }
      
      if (error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({
          error: 'Invalid token',
          message: 'The provided authentication token is invalid'
        });
      }
      
      return res.status(401).json({
        error: 'Authentication error',
        message: 'An error occurred while authenticating your request'
      });
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: 'An error occurred while authenticating your request'
    });
  }
};

/**
 * Simplified authentication middleware that only validates the token and attaches the user ID
 * to the request without fetching the full user object
 * Use this when you only need the user ID in your route handler
 */
export const simpleAuthMiddleware = async (req: SimpleAuthRequest, res: Response, next: NextFunction) => {
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
      
      if (!decoded.id) {
        logger.warn('Auth failed: No user ID in token');
        return res.status(401).json({
          success: false,
          message: 'Invalid session',
          code: 'NO_USER_ID'
        });
      }
      
      req.user = { id: decoded.id };
      next();
    } catch (error) {
      logger.error('Token verification error:', error);
      
      if (error instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ 
          success: false,
          message: 'Session expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (error instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ 
          success: false,
          message: 'Invalid session',
          code: 'INVALID_TOKEN'
        });
      }
      
      return res.status(401).json({ 
        success: false,
        message: 'Authentication error',
        code: 'TOKEN_ERROR'
      });
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