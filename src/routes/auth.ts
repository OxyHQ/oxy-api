import express, { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User";
import Notification from "../models/Notification";
import { AuthenticationError } from '../utils/authErrors';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Ensure environment variables are loaded
dotenv.config();

const router = express.Router();

// Generate tokens with error handling
const generateTokens = (userId: string, username: string) => {
  try {
    if (!process.env.ACCESS_TOKEN_SECRET || !process.env.REFRESH_TOKEN_SECRET) {
      throw new Error('Token secrets not configured');
    }

    const accessToken = jwt.sign(
      { id: userId, username },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "1h" }
    );
    
    const refreshToken = jwt.sign(
      { id: userId, username },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );
    
    return { accessToken, refreshToken };
  } catch (error) {
    logger.error('Token generation error:', error);
    throw new Error('Failed to generate authentication tokens');
  }
};

// User signup API
router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    
    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ 
        message: "Missing required fields",
        details: {
          username: !username ? "Username is required" : null,
          email: !email ? "Email is required" : null,
          password: !password ? "Password is required" : null
        }
      });
    }

    // Check if user already exists
    const existing = await User.findOne({ $or: [{email}, {username}] });
    if (existing) {
      return res.status(400).json({ 
        message: existing.email === email ? "Email already in use" : "Username already taken" 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user document with initialized profile fields
    const userFields = {
      username,
      email,
      password: hashedPassword,
      bookmarks: [],
      refreshToken: null,
      name: { first: "", last: "" },
      privacySettings: {
        isPrivateAccount: false,
        hideOnlineStatus: false,
        hideLastSeen: false,
        profileVisibility: true,
        postVisibility: true,
        twoFactorEnabled: false,
        loginAlerts: true,
        blockScreenshots: false,
        secureLogin: true,
        biometricLogin: false,
        showActivity: true,
        allowTagging: true,
        allowMentions: true,
        hideReadReceipts: false,
        allowComments: true,
        allowDirectMessages: true,
        dataSharing: true,
        locationSharing: false,
        analyticsSharing: true,
        sensitiveContent: false,
        autoFilter: true,
        muteKeywords: false,
      },
      associated: {
        lists: 0,
        feedgens: 0,
        starterPacks: 0,
        labeler: false,
      },
      labels: [],
      description: "",
      coverPhoto: "",
      location: "",
      website: "",
      pinnedPost: { cid: "", uri: "" },
      _count: {
        followers: 0,
        following: 0,
        posts: 0,
        karma: 0,
      }
    };

    console.log('Creating user with fields:', {
      ...userFields,
      password: '[HIDDEN]'
    });

    // Create new user instance
    const newUser = new User();
    Object.assign(newUser, userFields);

    // Double check all required fields are set
    console.log('Field presence check:', {
      hasUsername: !!newUser.username,
      hasEmail: !!newUser.email,
      hasPassword: !!newUser.password
    });

    // Validate the document
    const validationError = newUser.validateSync();
    if (validationError) {
      console.error('Validation errors:', validationError.errors);
      return res.status(400).json({
        message: "Validation error",
        errors: validationError.errors
      });
    }

    console.log('Model validation passed. Document to save:', {
      ...newUser.toObject(),
      password: '[HIDDEN]'
    });

    // Save with explicit error handling
    let savedUser;
    try {
      savedUser = await newUser.save();
      
      // Verify saved document has all fields
      const rawSavedDoc = await User.findById(savedUser._id)
        .select('+password +email +refreshToken')
        .lean();
      
      console.log('Raw saved document:', {
        ...rawSavedDoc,
        password: rawSavedDoc?.password ? '[PRESENT]' : '[MISSING]',
        email: rawSavedDoc?.email ? '[PRESENT]' : '[MISSING]'
      });

      if (!savedUser.email || !savedUser.password) {
        throw new Error("Critical fields missing after save");
      }

      console.log('User saved successfully. Saved document:', {
        ...savedUser.toObject(),
        password: '[HIDDEN]'
      });
    } catch (error) {
      throw new Error(`Error saving user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create welcome notification
    await new Notification({
      recipientId: savedUser._id,
      actorId: savedUser._id, // Self-notification for welcome message
      type: 'welcome', // Add 'welcome' to the type enum in Notification model
      entityId: savedUser._id,
      entityType: 'profile',
      read: false
    }).save();

    // Generate initial token
    const token = jwt.sign(
      { id: savedUser._id, username: savedUser.username },
      process.env.ACCESS_TOKEN_SECRET || "default_secret",
      { expiresIn: "24h" }
    );

    // Return success with sanitized user data
    return res.status(200).json({ 
      message: "User signed up successfully",
      token,
      user: {
        id: savedUser._id,
        username: savedUser.username,
        email: savedUser.email,
        createdAt: savedUser.createdAt,
        updatedAt: savedUser.updatedAt
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ 
      message: "Signup error", 
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Enhanced login route with detailed error handling
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ 
        success: false,
        message: "Username and password are required",
        details: {
          username: !username ? "Username is required" : null,
          password: !password ? "Password is required" : null
        }
      });
    }

    // Find user with password and profile fields
    const user = await User.findOne({ username })
      .select('+password +refreshToken name avatar privacySettings');
      
    if (!user) {
      logger.warn(`Login attempt failed: User not found - ${username}`);
      return res.status(401).json({ 
        success: false,
        message: "Invalid username or password"
      });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      logger.warn(`Login attempt failed: Invalid password for user - ${username}`);
      return res.status(401).json({ 
        success: false,
        message: "Invalid username or password"
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.username);

    // Store refresh token hash
    try {
      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
      user.refreshToken = refreshTokenHash;
      await user.save();
    } catch (tokenError) {
      logger.error('Error storing refresh token:', tokenError);
      return res.status(500).json({ 
        success: false,
        message: "Login failed - Unable to complete authentication"
      });
    }
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        name: user.name || {},
        avatarSource: user.avatar ? { uri: user.avatar } : null,
        privacySettings: user.privacySettings
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({ 
      success: false,
      message: "An unexpected error occurred during login",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Enhanced refresh token endpoint
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      logger.warn('Refresh attempt without token');
      throw new AuthenticationError("Refresh token required", 400);
    }

    if (!process.env.REFRESH_TOKEN_SECRET) {
      logger.error('REFRESH_TOKEN_SECRET not configured');
      throw new AuthenticationError("Server configuration error", 500);
    }

    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET) as { id: string; username: string };
      const user = await User.findById(decoded.id).select('+refreshToken') as IUser;

      if (!user) {
        logger.warn(`Refresh failed: User not found - ${decoded.id}`);
        throw new AuthenticationError("Invalid session", 404);
      }

      // Verify stored refresh token
      const isValidToken = await bcrypt.compare(refreshToken, user.refreshToken || '');
      if (!isValidToken) {
        logger.warn(`Refresh failed: Invalid token for user ${decoded.id}`);
        throw new AuthenticationError("Invalid refresh token", 401);
      }

      const tokens = generateTokens(user._id.toString(), user.username);
      
      // Update stored refresh token
      const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
      user.refreshToken = newRefreshTokenHash;
      await user.save();

      logger.info(`Refresh successful for user ${decoded.id}`);
      return res.status(200).json({
        success: true,
        message: "Tokens refreshed successfully",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      });
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        logger.info('Refresh failed: Token expired');
        throw new AuthenticationError("Refresh token expired", 401);
      }
      if (jwtError instanceof jwt.JsonWebTokenError) {
        logger.warn('Refresh failed: Invalid token');
        throw new AuthenticationError("Invalid refresh token", 401);
      }
      throw jwtError;
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return res.status(error.statusCode || 401).json({ 
        success: false,
        message: error.message 
      });
    }
    logger.error('Unexpected refresh error:', error);
    return res.status(500).json({ 
      success: false,
      message: "Token refresh failed",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Enhanced logout endpoint
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as { id: string };
    const user = await User.findById(decoded.id);

    if (user) {
      user.refreshToken = null;
      await user.save();
    }

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
});

// Enhanced validate session endpoint with better error handling
router.get("/validate", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      console.warn('[Auth] No token provided for validation');
      return res.status(401).json({ 
        valid: false,
        message: "No token provided" 
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as { id: string };
      const user = await User.findById(decoded.id).select('+refreshToken');

      if (!user) {
        console.warn('[Auth] User not found for token validation:', decoded.id);
        return res.status(404).json({ 
          valid: false,  
          message: "User not found" 
        });
      }

      if (!user.refreshToken) {
        console.warn('[Auth] No refresh token found for user:', decoded.id);
        return res.status(401).json({ 
          valid: false, 
          message: "Session invalidated" 
        });
      }

      return res.status(200).json({ valid: true });
      
    } catch (jwtError) {
      console.error('[Auth] Token verification failed:', jwtError);
      if (jwtError instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ 
          valid: false, 
          message: "Token has expired" 
        });
      }
      if (jwtError instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({ 
          valid: false, 
          message: "Token signature is invalid" 
        });
      }
      throw jwtError;
    }
  } catch (error) {
    console.error('[Auth] Unexpected error during validation:', error);
    return res.status(500).json({ 
      valid: false, 
      message: "Validation error" 
    });
  }
});

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
        details: {
          username: !username ? "Username is required" : null,
          email: !email ? "Email is required" : null,
          password: !password ? "Password is required" : null
        }
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
        details: {
          username: existingUser.username === username ? "Username is already taken" : null,
          email: existingUser.email === email ? "Email is already registered" : null
        }
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user with initialized profile fields
    const user = new User({
      username,
      email,
      password: hashedPassword,
      name: { first: "", last: "" },
      privacySettings: {
        isPrivateAccount: false,
        hideOnlineStatus: false,
        hideLastSeen: false,
        profileVisibility: true,
        postVisibility: true,
        twoFactorEnabled: false,
        loginAlerts: true,
        blockScreenshots: false,
        secureLogin: true,
        biometricLogin: false,
        showActivity: true,
        allowTagging: true,
        allowMentions: true,
        hideReadReceipts: false,
        allowComments: true,
        allowDirectMessages: true,
        dataSharing: true,
        locationSharing: false,
        analyticsSharing: true,
        sensitiveContent: false,
        autoFilter: true,
        muteKeywords: false,
      },
      associated: {
        lists: 0,
        feedgens: 0,
        starterPacks: 0,
        labeler: false,
      },
      labels: [],
      _count: {
        followers: 0,
        following: 0,
        posts: 0,
        karma: 0,
      }
    });

    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id.toString(), username);

    // Store refresh token hash
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    user.refreshToken = refreshTokenHash;
    await user.save();

    // Return success response
    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        name: user.name,
        privacySettings: user.privacySettings
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during registration",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;