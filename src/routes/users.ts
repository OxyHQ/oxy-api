import { Router, Request, Response, NextFunction } from 'express';
import User, { IUser } from '../models/User';
import Follow, { FollowType } from '../models/Follow';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../utils/logger';
import { Types } from 'mongoose';
import { UsersController } from '../controllers/users.controller';

interface AuthRequest extends Request {
  user?: {
    id: string;
  };
}

const router = Router();
const usersController = new UsersController();

// Middleware to validate ObjectId
const validateObjectId = (req: Request, res: Response, next: NextFunction) => {
  if (!Types.ObjectId.isValid(req.params.userId)) {
    return res.status(400).json({ message: 'Invalid user ID' });
  }
  next();
};

// Get user by ID
router.get('/:userId', validateObjectId, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.userId).select('-password -refreshToken');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update user profile
router.put('/:userId', authMiddleware, validateObjectId, async (req: AuthRequest, res: Response) => {
  try {
    // Only allow users to update their own profile
    if (req.params.userId !== req.user?.id) {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    const allowedUpdates = ['name', 'avatar', 'coverPhoto', 'description', 'location', 'website', 'labels'] as const;
    type AllowedUpdate = typeof allowedUpdates[number];
    
    const updates = Object.entries(req.body)
      .filter(([key]) => allowedUpdates.includes(key as AllowedUpdate))
      .reduce((obj, [key, value]) => ({
        ...obj,
        [key]: value
      }), {} as Partial<Pick<IUser, AllowedUpdate>>);

    console.log('Profile update request:', {
      userId: req.params.userId,
      requestBody: req.body,
      filteredUpdates: updates
    });

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: updates },
      { new: true }
    ).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update privacy settings
router.put('/:userId/privacy', authMiddleware, validateObjectId, async (req: AuthRequest, res: Response) => {
  try {
    if (req.params.userId !== req.user?.id) {
      return res.status(403).json({ message: 'Not authorized to update privacy settings' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: { privacySettings: req.body } },
      { new: true }
    ).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error('Error updating privacy settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user's followers
router.get('/:userId/followers', validateObjectId, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate<{ followers: IUser[] }>({
        path: 'followers',
        select: '-password -refreshToken'
      })
      .select('followers');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.followers || []);
  } catch (error) {
    logger.error('Error fetching followers:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user's following
router.get('/:userId/following', validateObjectId, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate<{ following: IUser[] }>({
        path: 'following',
        select: '-password -refreshToken'
      })
      .select('following');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.following || []);
  } catch (error) {
    logger.error('Error fetching following:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Follow a user
router.post('/:userId/follow', authMiddleware, validateObjectId, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }

    const [targetUser, currentUser] = await Promise.all([
      User.findById(targetUserId),
      User.findById(currentUserId)
    ]);

    if (!targetUser || !currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already following
    const existingFollow = await Follow.findOne({
      followerUserId: currentUserId,
      followType: FollowType.USER,
      followedId: targetUserId
    });

    if (existingFollow) {
      // Unfollow
      await Promise.all([
        Follow.deleteOne({ _id: existingFollow._id }),
        User.findByIdAndUpdate(targetUserId, { $inc: { '_count.followers': -1 } }),
        User.findByIdAndUpdate(currentUserId, { $inc: { '_count.following': -1 } })
      ]);

      const [updatedTarget, updatedCurrent] = await Promise.all([
        User.findById(targetUserId).select('_count'),
        User.findById(currentUserId).select('_count')
      ]);

      return res.json({
        message: 'Successfully unfollowed user',
        action: 'unfollow',
        counts: {
          followers: updatedTarget?._count?.followers || 0,
          following: updatedCurrent?._count?.following || 0
        }
      });
    }

    // Follow
    await Promise.all([
      Follow.create({
        followerUserId: currentUserId,
        followType: FollowType.USER,
        followedId: targetUserId
      }),
      User.findByIdAndUpdate(targetUserId, { $inc: { '_count.followers': 1 } }),
      User.findByIdAndUpdate(currentUserId, { $inc: { '_count.following': 1 } })
    ]);

    const [updatedTarget, updatedCurrent] = await Promise.all([
      User.findById(targetUserId).select('_count'),
      User.findById(currentUserId).select('_count')
    ]);

    res.json({
      message: 'Successfully followed user',
      action: 'follow',
      counts: {
        followers: updatedTarget?._count?.followers || 0,
        following: updatedCurrent?._count?.following || 0
      }
    });
  } catch (error) {
    logger.error('Error following user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Unfollow a user
router.delete('/:userId/follow', authMiddleware, validateObjectId, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: 'Cannot unfollow yourself' });
    }

    const [targetUser, currentUser] = await Promise.all([
      User.findById(targetUserId),
      User.findById(currentUserId)
    ]);

    if (!targetUser || !currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if not following
    const targetUserObjectId = new Types.ObjectId(targetUser._id);
    if (!currentUser.following?.some(id => id.equals(targetUserObjectId))) {
      return res.status(400).json({ message: 'Not following this user' });
    }

    // Update both users
    await Promise.all([
      User.findByIdAndUpdate(currentUserId, { $pull: { following: targetUser._id } }),
      User.findByIdAndUpdate(targetUserId, { $pull: { followers: currentUser._id } })
    ]);

    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    logger.error('Error unfollowing user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get following status
router.get('/:userId/following-status', authMiddleware, validateObjectId, async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const follow = await Follow.findOne({
      followerUserId: currentUserId,
      followType: FollowType.USER,
      followedId: targetUserId
    });

    res.json({ isFollowing: !!follow });
  } catch (error) {
    logger.error('Error checking following status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Search users
router.post('/search', usersController.searchUsers.bind(usersController));

export default router;