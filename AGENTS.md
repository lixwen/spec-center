# Repository Guidelines

## Project Structure & Module Organization

Monorepo with npm workspaces:

```
spec-center/
├── apps/web/              # Next.js 16 App Router — UI + API route handlers
│   ├── app/               # Pages (/changes, /reviews, /ask, /settings, etc.)
│   │   └── api/           # ~50 REST API endpoints
│   ├── components/        # React client components
│   └── lib/               # i18n, session, project utilities
├── packages/core/         # Shared domain logic (published as @spec-center/core)
│   ├── src/domain/        # TypeScript interfaces (models.ts) and Zod schemas
│   ├── src/data/          # MongoDB client + Qdrant vector client
│   ├── src/services/      # Business services (auth, center, agent, RAG, context)
│   └── src/utils/         # Auth (JWT), hashing, ID generation, chunker
├── tests/                 # Integration and unit tests (Vitest)
├── docker/                # Docker support (mongo-init.js, nginx config)
└── docs/                  # Architecture and deployment documentation
```

## Build, Test, and Development Commands

```bash
npm install                                    # Install all workspace dependencies
npm run dev                                    # Start Next.js dev server
npm run build                                  # Build core → web
npm test                                       # Run all tests (vitest, --maxWorkers=1)
npm run test:watch                             # Watch mode
npm run typecheck                              # TypeScript checking across all workspaces
npm run worker --workspace @spec-center/core   # Start embedding worker
```

Infrastructure (requires Docker):
```bash
docker compose up -d mongo qdrant              # Start databases for local dev
docker compose up -d --build                   # Full deployment (all services)
```

## Coding Style & Naming Conventions

- **Language**: TypeScript throughout. Strict mode enabled.
- **Files**: `kebab-case.ts` / `kebab-case.tsx`
- **Variables/functions**: `camelCase`
- **Types/interfaces**: `PascalCase`
- **DB collections**: `snake_case`
- **Styling**: Tailwind CSS only, `clsx` for conditional classes
- **i18n**: All UI strings in `apps/web/lib/i18n.ts` with English and Chinese
- **Imports**: Use `@spec-center/core` for cross-package imports
- **Comments**: Only for non-obvious intent; no narration of what code does

## Testing Guidelines

- Test framework: **Vitest**
- Tests in `tests/` at project root
- Test database: `spec-center-test` (configured in `vitest.config.ts`)
- External services (AI APIs) are mocked in tests
- Environment variables for tests use `AI_*` prefix (`AI_API_KEY`, `AI_CHAT_MODEL`, etc.)

## Commit & Pull Request Guidelines

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`
Scopes: `core`, `web`, `docker`, `ci`

## Key Architecture Decisions

- **AI Provider**: Uses OpenAI SDK with configurable `AI_BASE_URL` for any OpenAI-compatible endpoint
- **Auth**: Custom JWT (HS256) + API Tokens (`osc_*` prefix, SHA-256 hashed)
- **Data**: MongoDB for documents, Qdrant for vector search
- **Review model**: Baseline-locked snapshots; working snapshots update independently during review
- **RAG**: Embedding worker processes snapshots/changes/comments → Qdrant; agent loop with tool use for Q&A
