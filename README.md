# Spec Center

A collaborative platform for Spec-Driven Development across multiple repositories. Spec Center brings together product managers, engineers, and QA around a shared review surface — connecting distributed specs into a unified Change lifecycle with baseline-aware review.

## Why Spec Center?

In microservice and frontend/backend-split architectures, specs are scattered across repositories with no unified view. Spec Center solves this by:

- **Unifying specs under Changes** — group specs from multiple repos into a single reviewable Change
- **Baseline-aware review** — lock snapshots for review while development continues
- **Product Spec baselines** — maintain a living catalog of product capabilities that evolves with each Change
- **AI-powered knowledge Q&A** — semantic search and RAG-based Q&A across all project documents
- **API-driven sync** — publish spec snapshots to the platform via REST API

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  docker-compose.yml                  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ MongoDB  │  │  Qdrant  │  │   Next.js Web     │  │
│  │  :27017  │  │  :6333   │  │     :3000         │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────────┘  │
│       │              │               │               │
│       └──────────────┴───────────────┘               │
│                      │                               │
│             ┌────────┴─────────┐                     │
│             │ Embedding Worker │                     │
│             └──────────────────┘                     │
└─────────────────────────────────────────────────────┘
```

| Component | Purpose |
|-----------|---------|
| **apps/web** | Next.js App Router — UI + API route handlers |
| **packages/core** | Shared domain models, services, data layer (MongoDB + Qdrant) |

## Tech Stack

- **Runtime** — Node.js 22, TypeScript
- **Frontend** — Next.js (App Router), React, Tailwind CSS
- **Database** — MongoDB (documents), Qdrant (vectors)
- **AI** — Any OpenAI-compatible API (OpenRouter, OpenAI, Ollama, etc.)
- **Testing** — Vitest

## Quick Start

### Docker (recommended)

```bash
# Clone the repository
git clone https://github.com/anthropics/spec-center.git
cd spec-center

# Configure environment
cp .env.example .env
# Edit .env — set AI_API_KEY and change default passwords

# Start all services
docker compose up -d --build

# Open http://localhost:23333
```

### Local Development

```bash
# Start infrastructure only
docker compose up -d mongo qdrant

# Set local connection in .env
# OPENSPEC_MONGODB_URL=mongodb://openspec_app:changeme_app@127.0.0.1:27017/spec-center?authSource=spec-center
# QDRANT_URL=http://localhost:6333

# Install dependencies and start
npm install
npm run dev

# In another terminal — start the embedding worker
npm run worker --workspace @spec-center/core
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `MONGO_ROOT_PASSWORD` | MongoDB root password |
| `MONGO_APP_PASSWORD` | Application database password |
| `AI_API_KEY` | API key for your AI provider |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_BASE_URL` | `https://openrouter.ai/api/v1` | OpenAI-compatible API base URL |
| `AI_EMBEDDING_MODEL` | `intfloat/multilingual-e5-large` | Embedding model identifier |
| `AI_CHAT_MODEL` | `anthropic/claude-sonnet-4` | Chat model identifier |
| `OPENSPEC_JWT_SECRET` | Auto-generated in dev | JWT signing secret |
| `OPENSPEC_BOOTSTRAP_ADMIN_USERNAME` | — | Auto-create admin on first start |
| `OPENSPEC_BOOTSTRAP_ADMIN_PASSWORD` | — | Admin password for bootstrap |

## Features

- **Change Dashboard** — track review pressure, blockers, sync freshness, and reviewer progress
- **Review Workspace** — baseline-locked review with AI advisory briefs and cross-spec analysis
- **Product Spec Browser** — capability catalog with evolution history
- **RAG Knowledge Q&A** — agent-based semantic Q&A with tool use across project documents
- **Multi-project** — isolated project contexts with RBAC (platform admin, project admin, PM, reviewer, viewer)
- **i18n** — English and Chinese interface
- **MCP Server** — Model Context Protocol endpoint for AI tool integration

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run typecheck     # Type checking across all workspaces
```

## Documentation

- [Architecture](docs/architecture.md) — monorepo structure, runtime model, authentication
- [Deployment](docs/deployment.md) — Docker Compose setup, environment variables, data migration
- [Development](docs/development.md) — local setup, AI provider configuration, project layout

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding conventions, and PR guidelines.

## License

[MIT](LICENSE)
