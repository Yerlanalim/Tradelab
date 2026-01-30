# TradeLab Local Backend

Local Express backend for TradeLab to avoid Supabase Edge Function 60-second timeout limitation.

## Features

- **No timeout limits**: Runs locally without Supabase Edge Function constraints
- **Extended OpenAI timeouts**: 120-180 seconds instead of 35-45 seconds
- **Supabase integration**: Uses Supabase only for database operations
- **Authentication**: JWT-based authentication via Supabase Auth
- **Rate limiting**: 30 requests per minute per user

## Setup

1. Install dependencies:
```bash
npm install
```

2. Environment variables are loaded from `../.env` (parent directory)

3. Required environment variables:
- `OPENAI_API_KEY`
- `P3_SEARCH_MODEL`
- `P3_BASE_MODEL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Development

Start the development server with hot reload:
```bash
npm run dev
```

Server will run on `http://localhost:3001`

## Production

Build and run:
```bash
npm run build
npm start
```

## API Endpoints

### Health Check
```
GET /health
```

### Chat Handler
```
POST /chat
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "..." }
  ],
  "page_context": "/products/supplier-search",
  "session_id": "...",
  "context": {}
}
```

## Architecture

- `server.ts` - Express server setup
- `config.ts` - Environment configuration
- `openai.ts` - OpenAI client with extended timeouts
- `chat-handler.ts` - Main chat logic (migrated from Supabase Edge Function)
- `pricing.ts` - Pricing constants

## Migration Notes

- Converted from Deno to Node.js/Express
- Removed CORS restrictions (simplified for local/proxy usage)
- Increased OpenAI API timeouts (2-3x longer)
- Supabase used only for:
  - User authentication
  - Database operations (api_usage, chat_entities, etc.)
  - No Edge Functions
