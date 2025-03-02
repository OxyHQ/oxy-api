import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { AuthRequest } from '../types/auth';
import { createError } from '../utils/error';
import { Document } from 'mongoose';

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

        try {
            // Debug log for token verification
            console.log('Auth debug: Verifying token with secret:', process.env.ACCESS_TOKEN_SECRET ? 'Secret exists' : 'No secret');
            
            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as { id: string };
            console.log('Auth debug: Decoded token:', { hasId: !!decoded.id });
            
            const user = await User.findById(decoded.id);
            if (!user) {
                console.log('Auth debug: No user found for id:', decoded.id);
                return res.status(401).json({
                    error: 'Invalid token',
                    message: 'User not found'
                });
            }

            // Debug log for user object
            console.log('Auth debug:', {
                hasUser: !!user,
                userFields: Object.keys(user.toObject()),
                userId: user._id
            });

            // Set both the full user document and the id
            req.user = user;
            (req.user as any).id = decoded.id;

            next();
        } catch (error) {
            console.error('Token verification error:', error);
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
            throw error;
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            error: 'Server error',
            message: 'An error occurred while authenticating your request'
        });
    }
}; 