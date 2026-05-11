# Spec Center Architecture

## Overview

This repository is a lightweight monorepo:

- `apps/web`
  Next.js App Router UI and route handlers
- `packages/core`
  Shared domain types, schemas, service logic, seeded demo data

## Runtime model

- The current implementation uses MongoDB as the runtime data source.
- `packages/core` owns the Mongo client, collection bootstrap, seed flow, and service layer that powers both the web app and the API endpoints.
- Collections: `projects`, `users`, `changes`, `spec_units`, `snapshots`, `review_sessions`, `comments`, `api_tokens`.
- Review sessions lock baseline snapshots when review starts. New syncs only update working snapshots and set `new_version_available`.

## Authentication

Two credential types coexist; the middleware auto-dispatches based on token prefix:

| Type | Format | Lifetime | Use case |
|------|--------|----------|----------|
| JWT | `eyJ…` (HS256) | 8 hours | Browser sessions via `openspec-auth` cookie |
| API Token | `osc_` + 40 hex chars | No expiry (manual revoke) | CI/CD, API integrations |

- API Tokens are created per-user via `POST /api/api-tokens` or the Settings → API Tokens UI.
- Only the SHA-256 hash is stored; the raw token is shown once at creation time.
- All `/api/sync/*` endpoints require authentication (JWT or API Token).
- Token management: create, list, revoke at `/api/api-tokens`.

## Main commands

```bash
npm install
npm run dev
npm run test
npm run build
```

## MongoDB development

- Default connection: `mongodb://127.0.0.1:27017`
- Default database: `spec-center`
- Override with `OPENSPEC_MONGODB_URL` and `OPENSPEC_MONGODB_DB`
