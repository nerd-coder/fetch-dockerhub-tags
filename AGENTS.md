# AGENTS.md

## TypeScript Rules

- **Shared code**: put reusable helpers and utilities in `src/lib/` — operational scripts import from there. Organize `lib/` files by domain (e.g., `dockerhub.ts` for Docker Hub API interactions, `utils.ts` for general utilities).
- **Structure**: break code into small, focused functions — one function per logical step. The main flow should read like a sequence of named steps, not a single monolithic block.
- **Logging**: use `node:util` `styleText` for colored console output (e.g., `styleText('green', '✓ Done')`, `styleText('red', 'Error: ...')`). Use the `logStep`, `logSuccess`, `logError`, `logWarn`, `logInfo` helpers from `src/lib/utils.ts` (create one if none exists). Never use raw ANSI escape codes or `chalk`/`picocolors`.
- **Comments**: All utility functions should have a doc comment describing their purpose, inputs, and outputs.
- **No secrets in code**: reference env vars or `.env` files — never hardcode keys, tokens, or passwords
- **Exit codes**: use non-zero exit codes for failures; print a clear error message before exiting
