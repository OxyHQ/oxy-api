# Oxy API Documentation

## Overview

Oxy API is a robust backend service built with Express.js and TypeScript for the OxyHQServices module. It provides secure file management, authentication, and real-time communication capabilities for the Mention platform.

## Tech Stack

- Node.js with TypeScript
- Express.js for REST API
- MongoDB with Mongoose for data storage
- GridFS for file storage
- Socket.IO for real-time features
- JWT for authentication

## Features

- Secure file upload, storage, and retrieval
- User authentication and authorization
- Real-time communication
- RESTful API endpoints
- Token-based security
- Error handling and logging

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB instance
- npm or yarn package manager

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   ACCESS_TOKEN_SECRET=your_jwt_access_token_secret
   REFRESH_TOKEN_SECRET=your_jwt_refresh_token_secret
   PORT=3000
   ```

### Running the API

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## API Endpoints

### Authentication

#### POST /auth/signup
- Creates a new user account
- Body: `{ username: string, email: string, password: string }`
- Returns: User object and access token

#### POST /auth/login
- Authenticates existing user
- Body: `{ email: string, password: string }`
- Returns: Access and refresh tokens

#### POST /auth/refresh
- Refreshes access token
- Header: `Authorization: Bearer {refreshToken}`
- Returns: New access token

### Files

#### GET /files/:id
- Streams a file by ID
- Public route, no authentication required
- Returns: File stream

#### GET /files/meta/:id
- Gets metadata for a file
- Public route, no authentication required
- Returns: File metadata object

#### POST /files/upload
- Uploads a new file
- Authentication: Bearer token required
- Content-Type: multipart/form-data
- Returns: Uploaded file information

#### DELETE /files/:id
- Deletes a file by ID
- Authentication: Bearer token required
- Returns: Success message

## Error Handling

The API uses standardized error responses:

```json
{
  "message": "Error description",
  "error": "Detailed error information (development only)"
}
```

Common status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error

## Database Schema

### Files Collection
```javascript
{
  _id: ObjectId,
  length: Number,
  chunkSize: Number,
  uploadDate: Date,
  filename: String,
  contentType: String,
  metadata: {
    originalFilename: String,
    sanitizedFilename: String,
    uploadDate: Date
  }
}
```

## Development

### Project Structure
```
oxy-api/
├── src/
│   ├── middleware/    # Authentication and request processing
│   ├── models/        # MongoDB schema definitions
│   ├── routes/        # API endpoint definitions
│   ├── utils/         # Helper functions
│   ├── app.ts         # Express application setup
│   └── server.ts      # Server entry point
├── dist/              # Compiled JavaScript files
├── package.json       # Dependencies and scripts
└── tsconfig.json      # TypeScript configuration
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the AGPL License.