# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Spec Center, please report it responsibly:

1. **Do NOT** open a public GitHub Issue for security vulnerabilities
2. Email security concerns to the project maintainers (see GitHub profile for contact)
3. Include a description of the vulnerability and steps to reproduce

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

## Scope

This policy covers:

- The Spec Center application code (`apps/`, `packages/`)
- Docker deployment configurations
- Authentication and authorization mechanisms
- API endpoints

## Best Practices for Deployment

- Always change default passwords in `.env` before deploying
- Set a strong `OPENSPEC_JWT_SECRET` in production
- Enable `OPENSPEC_COOKIE_SECURE=true` when using HTTPS
- Restrict network access to MongoDB and Qdrant ports
- Keep Docker images updated to latest patch versions
