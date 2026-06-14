# ONMI Chatbox

ONMI Chatbox is a local-first multi-provider AI chat application. It pairs a React/Vite frontend with an Express backend, stores user data in local JSON files, and lets each user bring their own provider API keys.

[简体中文](README.zh-CN.md)

## What Works

- User registration and login with per-user conversation isolation.
- Provider configuration from the Settings page or `.env` fallbacks.
- Chat streaming over server-sent events.
- Conversation history, reload, deletion, Markdown transcript export, and session forking.
- Local JSON backup export/import for this app's own data format.
- Local usage estimates derived from stored conversations and messages.
- English and Simplified Chinese UI strings.

## Supported Providers

The app includes adapters and configuration UI for:

- OpenAI
- Anthropic Claude
- Google Gemini
- xAI Grok
- Ollama

Provider billing and token accounting remain external. The Usage page shows local estimates only; use each provider's official dashboard for authoritative billing.

## Requirements

- Node.js 18 or newer
- npm
- Optional API keys for the providers you want to use

## Setup

```bash
npm install
```

Create a `.env` file in the project root if you want server-side fallback keys:

```env
OPENAI_API_KEY=sk-your-openai-key
GEMINI_API_KEY=your-gemini-key
CLAUDE_API_KEY=your-claude-key
XAI_API_KEY=your-xai-key
OLLAMA_BASE_URL=http://localhost:11434
```

You can also add provider keys in the Settings page after signing in.

## Development

Run the frontend and backend together:

```bash
npm run dev
```

Or run them separately:

```bash
npm run client:dev
npm run server:dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001/api`

There is no `npm start` script in this project. For release checks, build the frontend and run the backend with the deployment process you choose.

## Verification

```bash
npm run check
npm run test:run
npm run build
```

`npm run check` runs TypeScript. `npm run test:run` runs Vitest once. `npm run build` type-checks and builds the Vite frontend.

## Data Storage

Runtime data is stored locally under `data/`, especially:

```text
data/database.json
```

This file contains users, conversations, messages, provider settings, and related local state. The app does not require an external database.

## API Surface

Authentication:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/user/:userId`
- `GET /api/auth/check-username/:username`

Chat:

- `GET /api/chat/conversations`
- `POST /api/chat/conversations`
- `GET /api/chat/conversations/:conversationId/messages`
- `POST /api/chat/conversations/:conversationId/fork`
- `DELETE /api/chat/conversations/:conversationId`
- `POST /api/chat`

Data:

- `GET /api/data/preview/:userId`
- `GET /api/data/export/:userId`
- `POST /api/data/import/:userId`

Usage:

- `GET /api/business/usage/:userId`

Authenticated routes are scoped to the current user. Do not bypass the existing auth middleware or user-scoped database helpers when adding routes.

## Project Layout

```text
api/        Express routes, auth middleware, provider adapters, JSON database
src/        React app, pages, components, hooks, Zustand stores
data/       Local runtime JSON data
public/     Static assets
```

## Notes For Contributors

- The backend uses ESM imports with explicit `.js` extensions even though source files are TypeScript.
- Chat responses stream through SSE, not Socket.IO.
- Keep route handlers thin and put shared behavior in `api/services/`.
- Treat Usage numbers as local estimates unless a provider returns exact usage metadata.
- Prefer the existing shadcn/Radix/Tailwind patterns instead of adding new UI dependencies.
