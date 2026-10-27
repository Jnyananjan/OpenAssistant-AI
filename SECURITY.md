# Security Policy

## Supported Versions

Only the current main development branch is supported for security updates.

| Version | Supported          |
| ------- | ------------------ |
| v0.1.x (dev) | :white_check_mark: |

## Reporting a Vulnerability

Security is a core priority of OpenAssistant AI. If you discover a vulnerability or potential security issue:

1. **Do not open a public GitHub issue.**
2. Report the vulnerability privately via GitHub Security Advisories or by emailing the project maintainers.
3. Include detailed steps to reproduce the issue, proof of concept (if available), and potential impact.

Please do not include sensitive data, real bot tokens, or private user IDs in reports.

## Security Practices in OpenAssistant AI

- **Zero-trust model for AI:** Model output is strictly parsed and validated using runtime schemas. The model cannot execute SQL, shell commands, or arbitrary network requests.
- **Server-side privilege:** Supabase service role keys and Telegram bot tokens must remain in server-side Edge Function secrets and are never exposed to clients.
- **Webhook authentication:** Every incoming Telegram request is validated against the configured `X-Telegram-Bot-Api-Secret-Token`.
- **Identity mapping & RLS:** All operations are authenticated against the sender's verified Telegram ID mapped to the internal `app_users` table.
- **Idempotency:** Webhook requests are deduplicated by `update_id` to prevent replay attacks and duplicate operations.
