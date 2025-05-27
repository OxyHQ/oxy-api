# Oxy API Documentation

This document provides an overview of the Oxy API backend service, its architecture, core components, data flow, and usage.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Authentication & Authorization](#authentication--authorization)
- [REST API Endpoints](#rest-api-endpoints)
- [Real‑time Notifications](#real‑time-notifications)
- [File Storage (GridFS)](#file-storage-gridfs)
- [Middleware & Security](#middleware--security)
- [Error Handling & Logging](#error-handling--logging)
- [Configuration & Environment](#configuration--environment)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview
Oxy API is a scalable backend service built with Express.js and TypeScript. It exposes RESTful endpoints and real‑time sockets to power authentication, user management, messaging, payments, wallet operations, analytics, and a karma/reputation system.

## Architecture

```
Client App  ↔  HTTP REST  ↔  Express.js  ↔  Controllers  ↔  Services/Mongoose Models  ↔  MongoDB
                   │
                   ↔  Socket.IO  ↔  Real‑time Event Handlers
``` 

- **Express.js** handles routing and middleware.
- **Controllers** implement business logic per feature.
- **Mongoose Models** map to MongoDB collections.
- **GridFS** is used for file upload and streaming.
- **Socket.IO** manages real‑time events for notifications.

## Core Components

- **Routes** (`src/routes`): Defines REST endpoints per feature (auth, users, profiles, notifications, payments, analytics, wallet, karma, search, privacy, files, sessions).
- **Controllers** (`src/controllers`): Implements request handlers, input validation (Zod), and response logic.
- **Models** (`src/models`): Mongoose schemas for Users, Wallets, Transactions, Analytics, Notifications, KarmaRules, Sessions, etc.
- **Middleware** (`src/middleware`): Security layers (rate limiting, brute force), auth, admin checks, premium feature gating, session activity tracking.
- **Services** (`src/services`): Helper modules (e.g., gridfs file storage, notification dispatch).
- **Sockets** (`src/sockets`): Authentication and event handling for real‑time notifications.
- **Utils** (`src/utils`): Session management utilities, logging, and other shared functions.

## Data Flow

1. **Incoming HTTP Request** → passes through security middleware (CORS, rate limiter, CSRF if enabled).
2. **Authentication Middleware** validates JWT and attaches `req.user`.
3. **Route Handler** delegates to Controller.
4. **Controller** validates input with Zod, interacts with Models.
5. **Mongoose** performs CRUD operations on MongoDB.
6. **Controller** returns JSON response or errors.
7. **Socket.IO** pushes real‑time updates (e.g., new notifications) to the user’s personal room.

## Authentication & Authorization

- **JWT** (`ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`) secure login and token refresh flows.
- **Auth Middleware** extracts Bearer token, verifies signature, and loads `req.user`.
- **Routes** are protected by `authMiddleware`, and some by `adminMiddleware` or `premiumAccess`.
- **Refresh Tokens** stored as hashed value in the User document for session validation.

## REST API Endpoints

### Auth
- POST `/auth/signup` – Create a new user.
- POST `/auth/login` – Authenticate user, returning access and refresh tokens.
- POST `/auth/refresh` – Exchange refresh token for new tokens.
- POST `/auth/logout` – Invalidate a refresh token.
- GET  `/auth/validate` – Verify access token validity.
- GET  `/auth/check-username/:username` – Check username availability.
- GET  `/auth/me` – Get current user profile (requires auth).

### Users & Profiles
- GET    `/profiles/username/:username` – Fetch public profile.
- GET    `/profiles/search` – Search for profiles by query.
- GET    `/profiles/recommendations` – Suggest users to follow.
- GET    `/users/:userId` – Get user by ID.
- PUT    `/users/:userId` – Update profile (requires auth).
- PUT    `/users/:userId/privacy` – Update privacy settings.
- GET    `/users/:userId/followers` – List followers.
- GET    `/users/:userId/following` – List following.
- POST   `/users/:userId/follow` – Follow/unfollow user.
- DELETE `/users/:userId/follow` – Unfollow explicitly.
- GET    `/users/:userId/following-status` – Check follow status.
- POST   `/users/search` – Server‑side search (advanced filtering).

### Notifications
- GET    `/notifications` – List user’s notifications (requires auth).
- GET    `/notifications/unread-count` – Get count of unread notifications.
- POST   `/notifications` – Create a new notification (admin).
- PUT    `/notifications/:id/read` – Mark single notification as read.
- PUT    `/notifications/read-all` – Mark all as read.
- DELETE `/notifications/:id` – Delete a notification.

### Payments & Wallet
- POST `/payments/process` – Charge user for a plan.
- POST `/payments/validate` – Validate payment method.
- GET  `/payments/methods/:userId` – List saved methods.
- GET  `/wallet/:userId` – Fetch or initialize wallet balance.
- GET  `/wallet/transactions/:userId` – List transaction history.
- GET  `/wallet/transaction/:transactionId` – Get specific transaction.
- POST `/wallet/transfer` – Transfer funds.
- POST `/wallet/purchase` – Process a purchase.
- POST `/wallet/withdraw` – Request withdrawal.

### Analytics & Karma
- GET  `/analytics` – Time‑series metrics (requires premium access).
- POST `/analytics/update` – Increment metrics.
- GET  `/analytics/viewers` – List content viewers.
- GET  `/analytics/followers` – Get follower analytics.
- GET  `/karma/leaderboard` – Global karma leaderboard.
- GET  `/karma/rules` – Listing karma rules.
- GET  `/karma/:userId/total` – User’s total karma.
- GET  `/karma/:userId/history` – User’s karma events (requires auth).
- POST `/karma/award` – Award karma (requires auth).
- POST `/karma/deduct` – Deduct karma (requires auth).
- POST `/karma/rules` – Create or update rules (admin only).

### Sessions (Multi-User Authentication)
- GET    `/sessions` – List active sessions for authenticated user.
- DELETE `/sessions/:sessionId` – Remote logout from specific session.
- POST   `/sessions/logout-others` – Logout from all other sessions (keep current).
- POST   `/sessions/logout-all` – Logout from all sessions including current.

## Real‑time Notifications

- **Socket.IO** server runs on the same HTTP server.
- Clients connect with `token` in handshake auth.
- After auth, users join room `user:{userId}`.
- Controllers or services emit events (e.g., `new_notification`) to that room.

## File Storage (GridFS)

- Files are streamed into MongoDB GridFS via `gridfs-stream` and `multer`.
- Routes under `/files` handle upload, download, metadata, and deletion.
- Metadata includes original filename, content type, upload timestamp.

## Middleware & Security

- **CORS**: Restricts origins to allowed list.
- **Rate Limiter** and **Slow Down**: Throttle excessive requests.
- **Brute Force Protection**: Blocks repeated failed auth attempts.
- **CSRF**: Enabled on non-API clients if configured.

## Error Handling & Logging

- Centralized error handler returns JSON with `message` and `error` (dev only).
- Errors are logged via a custom `logger` utility (Winston or console).
- Validation errors (Zod) return details with HTTP 400.

## Configuration & Environment

Create a `.env` file with:
```env
MONGODB_URI=<your-mongo-uri>
ACCESS_TOKEN_SECRET=<access-secret>
REFRESH_TOKEN_SECRET=<refresh-secret>
PORT=3001
``` 
Optionally configure rate limits, CORS origins, and premium feature flags.

## Deployment

- Build TypeScript: `npm run build`
- Start in production: `npm start`
- Recommend using PM2, Docker, or serverless platforms (e.g., Vercel, AWS Lambda).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes with clear messages
4. Run tests and linters
5. Open a Pull Request for review

## License

This project is licensed under the AGPL License.