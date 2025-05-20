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
    const currentUserId = req.user?.id;

    logger.info(`Fetching recommendations${currentUserId ? ` for user ${currentUserId}` : ''} with limit ${limit}`);

    // Build exclusion list (self + following)
    let excludeIds: Types.ObjectId[] = [];
    if (currentUserId) {
      excludeIds.push(new Types.ObjectId(currentUserId));
      const following = await Follow.find({
        followerUserId: currentUserId,
        followType: FollowType.USER
      }).select('followedId');
      excludeIds = excludeIds.concat(following.map(f => f.followedId instanceof Types.ObjectId ? f.followedId : new Types.ObjectId(f.followedId)));
    }

    // Aggregate users with follower/following counts in one query
    const recommendations = await User.aggregate([
      { $match: { _id: { $nin: excludeIds } } },
      { $sample: { size: limit } },
      {
        $lookup: {
          from: 'follows',
          let: { userId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ['$followedId', '$$userId'] }, { $eq: ['$followType', 'user'] } ] } } }
          ],
          as: 'followersArr'
        }
      },
      {
        $lookup: {
          from: 'follows',
          let: { userId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ['$followerUserId', '$$userId'] }, { $eq: ['$followType', 'user'] } ] } } }
          ],
          as: 'followingArr'
        }
      },
      {
        $project: {
          _id: 1,
          username: 1,
          name: 1,
          avatar: 1,
          description: 1,
          followersCount: { $size: '$followersArr' },
          followingCount: { $size: '$followingArr' }
        }
      }
    ]);

    logger.info(`Returning ${recommendations.length} optimized recommendations`);
    res.json(recommendations.map(u => ({
      id: u._id,
      username: u.username,
      name: u.name,
      avatar: u.avatar,
      description: u.description,
      _count: {
        followers: u.followersCount,
        following: u.followingCount
      }
    })));
  } catch (error) {
    logger.error('Error getting profile recommendations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router; 