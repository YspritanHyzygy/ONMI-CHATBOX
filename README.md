# ONMI Chatbox

ONMI Chatbox is a local-first, bring-your-own-key AI chat workspace for OpenAI, Anthropic Claude, Google Gemini, xAI, and Ollama. A React/Vite client talks to an Express API, while accounts, sessions, provider settings, conversations, and messages stay in a local JSON database.

[简体中文](README.zh-CN.md)

> Project status: local development preview. ONMI is designed for one trusted machine. It is not a hosted service or a production-ready multi-user deployment.

## Current capabilities

- Local accounts with user-scoped conversations and restart-safe sessions.
- Streaming chat over server-sent events (SSE).
- Provider and model configuration from the UI, with environment-variable fallbacks.
- Conversation history, search, rename, delete, fork, and Markdown transcript export.
- Safe JSON backups that exclude API credentials by default.
- Import preview and confirmation for destructive or credential-bearing restores.
- Read-only database health reporting for migration and integrity issues.
- Local request/token estimates. Provider dashboards remain the billing source of truth.
- English and Simplified Chinese UI.

## Requirements

- Node.js 20 or newer
- npm
- An API key for each remote provider you use, or a local Ollama instance

## Quick start

```bash
npm ci
```

Optionally copy `.env.example` to `.env` and add server-side fallback keys. You can also leave the keys empty and configure providers after signing in.

```bash
npm run dev
```

Open `http://localhost:5173`, register a local account, then configure at least one provider in **Settings**.

Default endpoints:

- Web client: `http://localhost:5173`
- API and health check: `http://127.0.0.1:3001/api`

The server binds to `127.0.0.1` by default. Do not change `HOST` to a public interface without also setting a narrow `CORS_ORIGINS` list and understanding that provider credentials are stored locally in plaintext.

## Provider configuration

UI settings take precedence over environment fallbacks for the signed-in user.

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_DEFAULT_MODEL=gpt-5

CLAUDE_API_KEY=
CLAUDE_BASE_URL=https://api.anthropic.com
CLAUDE_DEFAULT_MODEL=claude-sonnet-4

GEMINI_API_KEY=
GEMINI_DEFAULT_MODEL=gemini-2.5-pro

XAI_API_KEY=
XAI_BASE_URL=https://api.x.ai/v1
XAI_DEFAULT_MODEL=grok-4

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama-4-scout
```

For Ollama, use the server root such as `http://localhost:11434`, not `/v1`. ONMI normalizes older `/v1` values and uses Ollama's native chat and model endpoints.

An adapter being present does not guarantee that every model revision is compatible. Use the connection/model test in Settings before relying on a configuration.

## Local data and security

The default database is:

```text
data/database.json
```

Set `GEMINI_VIDEO_WEBUI_DB_PATH` to use another location. Automated tests always use an isolated temporary database.

Important security properties:

- Provider API keys are currently stored in plaintext in the local database. OS keychain or master-password encryption is not implemented.
- Session tokens are random opaque values; only their SHA-256 hashes and expiry times are persisted.
- Upgrading from the older in-memory token implementation requires signing in once again.
- Standard backup v2 files exclude API keys and never include sessions.
- “Include credentials” creates a sensitive plaintext backup and requires explicit confirmation.
- Replace imports require an additional destructive-action confirmation.
- Database migrations create a backup first. Integrity findings are reported but orphaned records are never deleted automatically.

Treat the database and credential-bearing backups like password files. Do not commit, email, or upload them to untrusted services.

## Verification

```bash
npm run verify
npm run test:e2e
```

`verify` runs TypeScript checks, ESLint, all Vitest tests, and a production frontend build. The Playwright smoke suite starts the app with an isolated database and a local mock Ollama server; it never calls a real AI provider.

Additional commands:

```bash
npm run test:run
npm run test:coverage
npm run check
npm run lint
npm run build
```

The test suite covers critical database, authentication, chat-context, provider, and UI regressions. It does not prove that third-party provider APIs are available, that every remote model behaves identically, or that ONMI is suitable for hostile multi-tenant hosting.

## Architecture

```text
React/Vite client
      │ authenticated fetch + SSE
      ▼
Express API ── provider adapters ── OpenAI / Claude / Gemini / xAI / Ollama
      │
      └── local JSON database (users, hashed sessions, configs, chats)
```

Main directories:

```text
src/        React pages, chat UI, stores, hooks, and i18n
api/        Express routes, auth, migrations, database, and provider adapters
e2e/        Isolated Playwright smoke tests
data/       Ignored local runtime data
```

All routes except `/api/auth/*` and `/api/health` pass through authentication middleware. User data access must remain scoped through the authenticated user, never a trusted client-supplied ID.

Notable endpoints:

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/chat/conversations`, `PATCH /api/chat/conversations/:id`, `DELETE /api/chat/conversations`
- `GET /api/chat/conversations/:id/messages`, `POST /api/chat/conversations/:id/fork`, `POST /api/chat`
- `GET /api/data/preview/:userId`, `GET /api/data/export/:userId`, `POST /api/data/import/:userId`
- `GET /api/data/health`
- `GET /api/business/usage/:userId`

## Deployment limits

- `npm run build` builds the browser client; this repository intentionally has no cloud/serverless deployment configuration.
- The JSON database is single-machine storage and is not safe for horizontally scaled or ephemeral hosting.
- Keep the API on localhost unless you add an appropriate reverse proxy, TLS, origin policy, rate limiting, durable shared storage, and a secrets strategy.

## Contributor notes

- The backend is ESM. TypeScript source imports use explicit `.js` extensions for Node resolution.
- Chat transport is SSE, not Socket.IO.
- Keep route handlers thin and shared behavior in `api/services/`.
- Preserve the dual `data`/`conversations` list response while older clients may depend on it.
- Never log provider credentials, raw session tokens, or complete sensitive request objects.
- Keep `README.md` and `README.zh-CN.md` behaviorally synchronized.

No project license is currently declared.
