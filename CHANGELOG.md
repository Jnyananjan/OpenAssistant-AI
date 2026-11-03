# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-03

### Added
- **Batch Multi-Task Reminders**: Natural language parsing of multiple tasks and deadlines in a single message (e.g. lists of exam deadlines, project deliverables) with individual follow-up reminders.
- **Automated Morning Trending Digests**: Proactive 8:00 AM executive briefings now automatically fetch and deliver live, structured gists on user-configured topics (`/topics`) powered by Google Gemini.
- **Interactive `/topics` Command**: Set or update tracked morning briefing topics directly in chat (e.g. `/topics AI, ML, Robotics, Startups`).
- **In-place Model & Routing Selection**: Interactive model picker (`/ai` -> `Select Model`) and routing mode toggles with live `🟢` active indicators.
- **Interactive Provider Management**: Manage, replace, or disconnect AI provider keys inline under `/providers`.
- **Private Custom Plugins Directory**: Support for local private extensions in `src/custom/` (gitignored), allowing private tools and custom commands without leaking to public git.
- **Expanded Context & Memory Limits**: Increased chat history buffer to 20 messages, recalled memory token limit to 2000 tokens, and response capacity to 4096 characters.

### Fixed
- **Webhook Callback Query Support**: Added `callback_query` to Telegram `allowed_updates` so all inline keyboard buttons (Done, Snooze, Reschedule) respond instantly.
- **pg_cron Token Synchronization**: Automated background synchronization of Postgres `pg_cron` worker tokens during deployments to prevent 401 Unauthorized reminder worker invocations.
- **Deprecated Gemini Models**: Upgraded digest generator from deprecated `gemini-2.5-flash` to active `gemini-3.5-flash-lite` and `gemini-3.5-flash`.
- **Webhook Constant-time Token Validation**: Patched timing-attack vulnerability via portable constant-time comparison in `webhook.ts`.

---

## [0.1.0] - 2026-10-25

### Added
- Initial public release of OpenAssistant AI.
- Telegram conversational bot with natural language date parsing.
- Persistent escalating follow-up reminder worker with exponential backoff.
- Supabase Edge Functions deployment + PostgreSQL persistence.
- Multi-provider AI support (Google Gemini, OpenAI, Anthropic Claude, Groq, OpenRouter).
- Developer setup wizard and configuration server.
