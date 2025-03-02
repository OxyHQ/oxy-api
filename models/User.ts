import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
    username: string;
    email: string;
    password: string;
    name: {
        first: string;
        last: string;
    };
    avatar: string;
    description: string;
    following: mongoose.Types.ObjectId[];
    followers: mongoose.Types.ObjectId[];
    bookmarks: mongoose.Types.ObjectId[];
    created_at: Date;
    updated_at: Date;
}

const UserSchema = new Schema<IUser>({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: {
        first: { type: String, required: true },
        last: { type: String }
    },
    avatar: { type: String },
    description: { type: String },
    following: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    followers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    bookmarks: [{ type: Schema.Types.ObjectId, ref: 'Post' }],
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

// Indexes
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ following: 1 });
UserSchema.index({ followers: 1 });

export const User = mongoose.model<IUser>('User', UserSchema); 