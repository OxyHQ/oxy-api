import { Request, Response, NextFunction } from 'express';
import { Post } from '../models/Post';
import { User } from '../models/User';
import { Hashtag } from '../models/Hashtag';
import { AuthRequest } from '../types/auth';
import { createError } from '../utils/error';

class FeedController {
    async getHomeFeed(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { limit = 20, cursor } = req.query;
            const userId = req.user?._id;

            // Get users that the current user follows
            const user = await User.findById(userId).select('following');
            const following = user?.following || [];

            // Build query
            const query: any = {
                userID: { $in: [...following, userId] },
                ...(cursor && { _id: { $lt: cursor } })
            };

            // Fetch posts
            const posts = await Post.find(query)
                .sort({ _id: -1 })
                .limit(Number(limit) + 1) // Get one extra to check if there are more
                .populate('author')
                .populate({
                    path: 'quoted_post',
                    populate: { path: 'author' }
                });

            // Check if there are more posts
            const hasMore = posts.length > Number(limit);
            if (hasMore) posts.pop(); // Remove the extra post

            // Get the next cursor
            const nextCursor = posts.length > 0 ? posts[posts.length - 1]._id : null;

            res.json({
                data: {
                    posts,
                    nextCursor,
                    hasMore
                }
            });
        } catch (error) {
            next(createError(500, 'Error fetching home feed'));
        }
    }

    async getUserFeed(req: Request, res: Response, next: NextFunction) {
        try {
            const { userId } = req.params;
            const { limit = 20, cursor } = req.query;

            const query: any = {
                userID: userId,
                ...(cursor && { _id: { $lt: cursor } })
            };

            const posts = await Post.find(query)
                .sort({ _id: -1 })
                .limit(Number(limit) + 1)
                .populate('author')
                .populate({
                    path: 'quoted_post',
                    populate: { path: 'author' }
                });

            const hasMore = posts.length > Number(limit);
            if (hasMore) posts.pop();

            const nextCursor = posts.length > 0 ? posts[posts.length - 1]._id : null;

            res.json({
                data: {
                    posts,
                    nextCursor,
                    hasMore
                }
            });
        } catch (error) {
            next(createError(500, 'Error fetching user feed'));
        }
    }

    async getExploreFeed(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit = 20, cursor } = req.query;

            const query: any = {
                ...(cursor && { _id: { $lt: cursor } })
            };

            const posts = await Post.find(query)
                .sort({ _id: -1 })
                .limit(Number(limit) + 1)
                .populate('author')
                .populate({
                    path: 'quoted_post',
                    populate: { path: 'author' }
                });

            const hasMore = posts.length > Number(limit);
            if (hasMore) posts.pop();

            const nextCursor = posts.length > 0 ? posts[posts.length - 1]._id : null;

            res.json({
                data: {
                    posts,
                    nextCursor,
                    hasMore
                }
            });
        } catch (error) {
            next(createError(500, 'Error fetching explore feed'));
        }
    }

    async getHashtagFeed(req: Request, res: Response, next: NextFunction) {
        try {
            const { hashtag } = req.params;
            const { limit = 20, cursor } = req.query;

            // Find or create hashtag
            let hashtagDoc = await Hashtag.findOne({ name: hashtag.toLowerCase() });
            if (!hashtagDoc) {
                hashtagDoc = await Hashtag.create({ name: hashtag.toLowerCase() });
            }

            const query: any = {
                hashtags: hashtagDoc._id,
                ...(cursor && { _id: { $lt: cursor } })
            };

            const posts = await Post.find(query)
                .sort({ _id: -1 })
                .limit(Number(limit) + 1)
                .populate('author')
                .populate({
                    path: 'quoted_post',
                    populate: { path: 'author' }
                });

            const hasMore = posts.length > Number(limit);
            if (hasMore) posts.pop();

            const nextCursor = posts.length > 0 ? posts[posts.length - 1]._id : null;

            res.json({
                data: {
                    posts,
                    nextCursor,
                    hasMore
                }
            });
        } catch (error) {
            next(createError(500, 'Error fetching hashtag feed'));
        }
    }

    async getBookmarksFeed(req: AuthRequest, res: Response, next: NextFunction) {
        try {
            const { limit = 20, cursor } = req.query;
            const userId = req.user?._id;

            // Get user's bookmarks
            const user = await User.findById(userId).select('bookmarks');
            const bookmarks = user?.bookmarks || [];

            const query: any = {
                _id: { $in: bookmarks },
                ...(cursor && { _id: { $lt: cursor } })
            };

            const posts = await Post.find(query)
                .sort({ _id: -1 })
                .limit(Number(limit) + 1)
                .populate('author')
                .populate({
                    path: 'quoted_post',
                    populate: { path: 'author' }
                });

            const hasMore = posts.length > Number(limit);
            if (hasMore) posts.pop();

            const nextCursor = posts.length > 0 ? posts[posts.length - 1]._id : null;

            res.json({
                data: {
                    posts,
                    nextCursor,
                    hasMore
                }
            });
        } catch (error) {
            next(createError(500, 'Error fetching bookmarks feed'));
        }
    }

    async getRepliesFeed(req: Request, res: Response, next: NextFunction) {
        try {
            const { parentId } = req.params;
            const { limit = 20, cursor } = req.query;

            const query: any = {
                in_reply_to_status_id: parentId,
                ...(cursor && { _id: { $lt: cursor } })
            };

            const posts = await Post.find(query)
                .sort({ _id: -1 })
                .limit(Number(limit) + 1)
                .populate('author')
                .populate({
                    path: 'quoted_post',
                    populate: { path: 'author' }
                });

            const hasMore = posts.length > Number(limit);
            if (hasMore) posts.pop();

            const nextCursor = posts.length > 0 ? posts[posts.length - 1]._id : null;

            res.json({
                data: {
                    posts,
                    nextCursor,
                    hasMore
                }
            });
        } catch (error) {
            next(createError(500, 'Error fetching replies feed'));
        }
    }
}

export const feedController = new FeedController(); 