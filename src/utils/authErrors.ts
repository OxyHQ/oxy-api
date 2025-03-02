import { TokenExpiredError, JsonWebTokenError, NotBeforeError } from 'jsonwebtoken';

export class AuthenticationError extends Error {
    public statusCode: number;

    constructor(message: string, statusCode: number = 401) {
        super(message);
        this.name = 'AuthenticationError';
        this.statusCode = statusCode;
    }
}

export const handleJWTError = (error: Error): AuthenticationError => {
    if (error instanceof TokenExpiredError) {
        return new AuthenticationError('Token has expired', 401);
    }
    if (error instanceof NotBeforeError) {
        return new AuthenticationError('Token not yet valid', 401);
    }
    if (error instanceof JsonWebTokenError) {
        if (error.message === 'invalid signature') {
            return new AuthenticationError('Token signature is invalid', 401);
        }
        if (error.message === 'jwt malformed') {
            return new AuthenticationError('Token format is invalid', 401);
        }
    }
    return new AuthenticationError('Invalid authentication token', 401);
};

export const createErrorResponse = (error: Error) => {
    const authError = error instanceof AuthenticationError 
        ? error 
        : handleJWTError(error);
    
    return {
        error: {
            message: authError.message,
            code: authError.statusCode
        }
    };
};