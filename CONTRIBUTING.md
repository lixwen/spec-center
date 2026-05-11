# Contributing to Spec Center

Thank you for your interest in contributing to Spec Center! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 22+
- Docker and Docker Compose (for MongoDB and Qdrant)
- An OpenAI-compatible API key (OpenRouter, OpenAI, Ollama, etc.)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/anthropics/spec-center.git
cd spec-center

# Start infrastructure
docker compose up -d mongo qdrant

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# Install dependencies
npm install

# Start development server
npm run dev
```

### Project Structure

```
spec-center/
├── apps/
│   └── web/              # Next.js App Router frontend + API
│       ├── app/          # Pages and API route handlers
│       ├── components/   # React components
│       └── lib/          # Shared utilities (i18n, etc.)
├── packages/
│   └── core/             # Shared domain models, services, data layer
│       ├── src/domain/   # TypeScript interfaces and Zod schemas
│       ├── src/data/     # MongoDB and Qdrant clients
│       ├── src/services/ # Business logic services
│       └── src/utils/    # Auth, hashing, chunking utilities
├── tests/                # Integration and unit tests
├── docker/               # Docker support files (mongo init, nginx)
└── docs/                 # Architecture and deployment documentation
```

## Coding Conventions

### TypeScript

- All code is written in TypeScript with strict mode enabled
- Use explicit types for function parameters and return values
- Prefer `interface` for object shapes, `type` for unions and intersections
- Domain models live in `packages/core/src/domain/models.ts`

### Naming

- Files: `kebab-case.ts` / `kebab-case.tsx`
- Variables and functions: `camelCase`
- Types and interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE` for environment-derived values, `camelCase` for others
- Database collections: `snake_case`

### Styling

- Tailwind CSS for all styling (no CSS modules or styled-components)
- Use `clsx` for conditional class names

### Comments

- Avoid obvious comments that just restate the code
- Document non-obvious intent, trade-offs, and constraints
- Use JSDoc for public API functions in `packages/core`

## Testing

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run typecheck     # Type checking across all workspaces
```

- Tests live in the `tests/` directory at the project root
- Use Vitest as the test framework
- Tests that require MongoDB use a separate `spec-center-test` database
- Mock external services (AI APIs, etc.) in tests

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`

Scopes: `core`, `web`, `docker`, `ci`

Examples:
```
feat(core): add cross-project RAG search
fix(web): prevent review session lock on stale snapshot
docs: update deployment guide for Docker Compose v2
chore(ci): add typecheck step to PR workflow
```

## Pull Requests

1. Fork the repository and create a feature branch from `main`
2. Make your changes with clear, atomic commits
3. Ensure all tests pass (`npm test`)
4. Ensure type checking passes (`npm run typecheck`)
5. Update documentation if your change affects user-facing behavior
6. Open a PR with a clear description of what and why

### PR Description Template

- **What** — brief summary of the change
- **Why** — motivation or issue reference
- **How** — approach taken (if non-obvious)
- **Testing** — how you verified the change

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include reproduction steps for bugs
- Check existing issues before creating duplicates

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
