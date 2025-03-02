import { Router, Request, Response } from 'express';
import User, { IUser } from '../models/User';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../utils/logger';
import { Types } from 'mongoose';
import { ParsedQs } from 'qs';
import Follow, { FollowType } from '../models/Follow';

interface SearchQuery extends ParsedQs {
  query?: string;
  limit?: string;
  offset?: string;
}

const router = Router();

// Get profile by username
router.get('/username/:username', async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error('Error fetching profile by username:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Search profiles
router.get('/search', async (req: Request<{}, {}, {}, SearchQuery>, res: Response) => {
  try {
    const { query, limit = '10', offset = '0' } = req.query;
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const searchRegex = new RegExp(query, 'i');
    const profiles = await User.find({
      $or: [
        { username: searchRegex },
        { 'name.first': searchRegex },
        { 'name.last': searchRegex },
        { description: searchRegex }
      ]
    })
    .select('-password -refreshToken')
    .limit(parseInt(limit))
    .skip(parseInt(offset));

    const enrichedProfiles = await Promise.all(
      profiles.map(async (profile: IUser) => {
        const followersCount = await User.countDocuments({ following: profile._id });
        const followingCount = await User.countDocuments({ followers: profile._id });

        return {
          ...profile.toObject(),
          _count: {
            ...profile._count,
            followers: followersCount,
            following: followingCount
          }
        };
      })
    );

    res.json(enrichedProfiles);
  } catch (error) {
    logger.error('Error searching profiles:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get recommended profiles
router.get('/recommendations', async (req: Request<{}, {}, {}, { limit?: string }> & { user?: { id: string } }, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const currentUserId = req.user?.id; // Optional now

    logger.info(`Fetching recommendations${currentUserId ? ` for user ${currentUserId}` : ''} with limit ${limit}`);

    // If user is authenticated, exclude them and their following
    const excludeIds: Types.ObjectId[] = [];
    if (currentUserId) {
      const currentUser = await User.findById(currentUserId);
      if (currentUser) {
        excludeIds.push(new Types.ObjectId(currentUserId));
        // Get users they're following from the Follow collection
        const following = await Follow.find({ 
          followerUserId: currentUserId,
          followType: FollowType.USER
        });
        following.forEach(f => {
          if (f.followedId instanceof Types.ObjectId) {
            excludeIds.push(f.followedId);
          } else {
            excludeIds.push(new Types.ObjectId(f.followedId));
          }
        });
      }
    }

    // Get random users not in excludeIds
    const recommendations = await User.aggregate([
      { $match: { _id: { $nin: excludeIds } } },
      { $sample: { size: limit } },
      { $project: { password: 0, refreshToken: 0 } }
    ]);

    logger.info(`Found ${recommendations.length} potential recommendations`);

    // Enrich with follower/following counts
    const enrichedRecommendations = await Promise.all(
      recommendations.map(async (profile) => {
        const [followersCount, followingCount] = await Promise.all([
          Follow.countDocuments({ followedId: profile._id, followType: FollowType.USER }),
          Follow.countDocuments({ followerUserId: profile._id, followType: FollowType.USER })
        ]);

        return {
          ...profile,
          _count: {
            ...profile._count,
            followers: followersCount,
            following: followingCount
          }
        };
      })
    );

    logger.info(`Returning ${enrichedRecommendations.length} enriched recommendations`);
    res.json(enrichedRecommendations);
  } catch (error) {
    logger.error('Error getting profile recommendations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router; 