# Development Guide

## Prerequisites

- **Node.js 22+**
- **Docker** and **Docker Compose** (for MongoDB and Qdrant)
- An API key for any **OpenAI-compatible** provider (OpenRouter, OpenAI, Ollama, etc.)

## Setup

```bash
# Clone and install
git clone https://github.com/anthropics/spec-center.git
cd spec-center
npm install

# Start databases
docker compose up -d mongo qdrant

# Configure environment
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
AI_API_KEY=your-api-key-here
AI_BASE_URL=https://openrouter.ai/api/v1   # or any OpenAI-compatible URL
```

For local MongoDB access, uncomment:

```bash
SC_MONGODB_URL=mongodb://sc_app:changeme_app@127.0.0.1:27017/spec-center?authSource=spec-center
QDRANT_URL=http://localhost:6333
```

## Running

```bash
# Web app (Next.js dev server)
npm run dev

# Embedding worker (in another terminal)
npm run worker --workspace @spec-center/core

# Build all packages
npm run build
```

## Testing

```bash
npm test              # All tests (requires MongoDB)
npm run test:watch    # Watch mode
npm run typecheck     # TypeScript check across all workspaces
```

Tests use a separate `spec-center-test` database (configured in `vitest.config.ts`).

AI services are mocked in tests — set `AI_API_KEY=test-key` in test setup.

## Project Layout

| Path | Description |
|------|-------------|
| `apps/web/app/` | Next.js pages and API route handlers |
| `apps/web/components/` | React client components |
| `apps/web/lib/` | Shared utilities (i18n, session, project context) |
| `packages/core/src/domain/` | TypeScript interfaces and Zod schemas |
| `packages/core/src/data/` | MongoDB and Qdrant client wrappers |
| `packages/core/src/services/` | Business logic services |
| `packages/core/src/utils/` | Auth, hashing, ID generation |
| `tests/` | Vitest test files |
| `docker/` | Docker support files (mongo-init, nginx) |

## AI Provider Configuration

The platform uses the OpenAI SDK and connects to any OpenAI-compatible endpoint:

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_API_KEY` | — | API key (required for RAG features) |
| `AI_BASE_URL` | `https://openrouter.ai/api/v1` | API base URL |
| `AI_CHAT_MODEL` | `anthropic/claude-sonnet-4` | Chat completions model |
| `AI_EMBEDDING_MODEL` | `intfloat/multilingual-e5-large` | Text embedding model |
| `AI_SUMMARY_MODEL` | Same as chat model | Model for conversation summarization |

Examples:

```bash
# OpenRouter
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=sk-or-v1-xxx

# OpenAI direct
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-xxx

# Local Ollama
AI_BASE_URL=http://localhost:11434/v1
AI_API_KEY=ollama
```

## Authentication

Two token types are supported:

- **JWT** (`eyJ…`) — 8-hour browser sessions via `sc-auth` cookie
- **API Token** (`osc_*`) — long-lived tokens for API access

To bootstrap an admin user on first start, set in `.env`:

```bash
SC_BOOTSTRAP_ADMIN_USERNAME=admin
SC_BOOTSTRAP_ADMIN_PASSWORD=your-password
```
