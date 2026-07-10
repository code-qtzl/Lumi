# beacon-app — agent instructions

Full-stack app for the Call for Code AI hackathon (product decisions live in team docs,
not here). This file covers coding practice only.

## Stack & commands

- `client/` — React 19 + TypeScript + Vite (port 5173)
- `server/` — Express + ts-node (port 3000)
- Run everything: `docker compose up --build` · or `npm run install:all`, then
  `cd server && npm run server` and `cd client && npm run dev`
- Verify before claiming done: `cd client && npm run lint && npm run build`, and
  `cd server && npm run typecheck`. (No test runner yet — don't claim tests passed.)

## Working agreements

- Plan before multi-file changes; wait for go-ahead.
- Verify with real command output; never assert unverified success.
- Fix root causes; never weaken or skip a check/test to make it pass.
- Stay scoped: change what the task needs, nothing else.
- Match existing patterns before introducing new styles or dependencies.
- No force-push; no `--no-verify`.
- Secrets live in `.env` files (gitignored). Never commit or print them. Document new
  variables in `server/.env.example`.

## Coding standards

Follow the existing code style in the repo. If a pattern is ambiguous, prefer
the simplest option that matches what's already there.

## Precedence

This file governs this repo and overrides personal/global agent instructions where they
conflict.
