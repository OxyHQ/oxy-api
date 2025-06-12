# Oxy API

JWT-based authentication server with session management and device isolation.

## Overview

Oxy API is a Node.js/TypeScript backend service that provides secure authentication for modern applications. It features JWT tokens, device-based sessions, and comprehensive user management.

## Features

- **JWT Authentication** - Secure token-based authentication with automatic refresh
- **Session Management** - Device-based session isolation for multi-user support
- **Express.js Server** - RESTful API with comprehensive middleware
- **MongoDB Integration** - Scalable data persistence with optimized queries
- **Security First** - Rate limiting, CORS, password hashing, and more
- **TypeScript** - Full type safety and excellent developer experience

## Quick Start

### Prerequisites
- Node.js 16+
- MongoDB 4.4+

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env  # Edit with your configuration

# Start development server
npm run dev
```

### Environment Configuration

Create `.env` file:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/oxyapi

# JWT Secrets (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ACCESS_TOKEN_SECRET=your_super_secure_access_token_secret_here
REFRESH_TOKEN_SECRET=your_super_secure_refresh_token_secret_here

# Server
PORT=3001
NODE_ENV=development

# CORS Origins
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:4000,http://localhost:8081
```

## API Endpoints

### Authentication
- `POST /auth/login` - Login with username/password
- `POST /auth/refresh` - Refresh access token
- `GET /auth/validate` - Validate current token
- `POST /auth/logout` - Logout and invalidate tokens
- `POST /users/register` - Register new user

### Session Management
- `POST /secure-session/login` - Create device session
- `GET /secure-session/token/:sessionId` - Get token for session
- `GET /secure-session/sessions` - List user sessions
- `DELETE /secure-session/logout/:sessionId` - Logout specific session
- `DELETE /secure-session/logout-all` - Logout all sessions

### User Management
- `GET /users/profile` - Get user profile
- `PUT /users/profile` - Update user profile

## Usage Examples

### Login
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your_username","password":"your_password"}'
```

### Validate Token
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/auth/validate
```

### Create Session
```bash
curl -X POST http://localhost:3001/secure-session/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass","deviceFingerprint":"device123"}'
```

## JWT Token Structure

Access tokens include both `id` and `userId` fields for compatibility:

```json
{
  "id": "user_id",
  "userId": "user_id", 
  "username": "string",
  "sessionId": "session_id",
  "iat": 1640995200,
  "exp": 1640998800
}
```

## Development

### Available Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run test suite

### Project Structure
```
src/
├── controllers/     # Route controllers
├── middleware/      # Express middleware
├── models/         # MongoDB models
├── routes/         # API routes
├── services/       # Business logic
├── types/          # TypeScript types
├── utils/          # Utility functions
└── server.ts       # Main server file
```

## Security Features

- **Password Hashing** - bcrypt with salt rounds
- **Rate Limiting** - Configurable request limits
- **CORS Protection** - Origin-based access control
- **JWT Verification** - Signature validation with secret rotation
- **Session Isolation** - Device-based session management
- **Input Validation** - Request data sanitization

## Database Schema

### Users Collection
```javascript
{
  username: String,
  email: String,
  password: String,        // bcrypt hashed
  refreshToken: String,
  preferences: Object,
  createdAt: Date
}
```

### Sessions Collection
```javascript
{
  userId: ObjectId,
  accessToken: String,
  deviceId: String,
  deviceInfo: Object,
  isActive: Boolean,
  expiresAt: Date
}
```

## Deployment

### Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

### Production Environment
```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/oxyapi
ACCESS_TOKEN_SECRET=production_secret
REFRESH_TOKEN_SECRET=production_refresh_secret
ALLOWED_ORIGINS=https://yourdomain.com
```

## Monitoring

Health check endpoint:
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-06-13T10:00:00.000Z",
  "services": {
    "database": true,
    "auth": true
  }
}
```

## Integration

Use with [OxyHQServices](../OxyHQServices/) client library:

```javascript
const { OxyServices } = require('@oxyhq/services/core');

const oxyServices = new OxyServices({
  baseURL: 'http://localhost:3001'
});

// Your app integration code...
```

## Documentation

- **[Complete Documentation](../docs/)** - Full system documentation
- **[API Reference](../docs/api-reference.md)** - Detailed endpoint documentation
- **[Authentication Guide](../docs/authentication.md)** - Auth system overview
- **[Troubleshooting](../docs/troubleshooting.md)** - Common issues and solutions

## License

This project is part of the OxyServices ecosystem.

---

**For complete system documentation, see [../docs/](../docs/)**