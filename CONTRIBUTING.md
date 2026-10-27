# Contributing to OpenAssistant AI

Thank you for your interest in contributing to OpenAssistant AI! OpenAssistant AI is an open-source, Telegram-first personal productivity assistant.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) in all interactions.

## How to Contribute

1. **Discuss first:** For non-trivial features or architectural changes, please open an issue to discuss before starting work.
2. **Fork and branch:** Create a feature branch off `main`.
3. **Write tests:** Every new feature, state transition, or bug fix must be accompanied by automated tests.
4. **Follow conventions:** Keep code concise, properly typed, and free of unnecessary abstractions.
5. **No committed credentials:** Never commit real secrets, bot tokens, or private conversation data.

## Local Development Workflow

1. Clone your fork and install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in local development settings:
   ```bash
   cp .env.example .env
   ```
3. Run test suites and type-checking:
   ```bash
   npm test
   npm run typecheck
   ```
4. Supabase local development:
   - Migrations are stored in `supabase/migrations/`.
   - Edge Functions are in `supabase/functions/`.

## Pull Request Guidelines

- Ensure `npm test` and `npm run typecheck` pass cleanly.
- Keep commits descriptive and atomic.
- Explain what was changed, why, and any known limitations.
