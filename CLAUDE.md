# beacon-app — agent instructions

Full-stack app for the Call for Code AI hackathon (product decisions live in team docs,
not here). This file covers coding practice only.

## Stack & commands

- `client/` — React 19 + TypeScript + Vite (port 5173)
- `server/` — Express + ts-node (port 3000)
- Run everything: `docker compose up --build` · or `npm run install:all`, then
  `cd server && npm run server` and `cd client && npm run dev`
- Verify before claiming done: `cd client && npm run lint && npm run build`, and
  `cd server && npm run typecheck && npm test && npm run eval`.

## Working agreements

- Plan before multi-file changes; wait for go-ahead.
- Verify with real command output; never assert unverified success.
- Fix root causes; never weaken or skip a check/test to make it pass.
- Stay scoped: change what the task needs, nothing else.
- Match existing patterns before introducing new styles or dependencies.
- No force-push; no `--no-verify`.
- Secrets live in `.env` files (gitignored). Never commit or print them. Document new
  variables in `server/.env.example`.
- `.env.example` is a template — values stay BLANK; `cp` (never `mv`) it to `.env`.
  Before every commit, read `git diff --cached` and grep it for key patterns
  (`gsk_`, `sk-`, `AIza`, `Bearer `). Never commit content restored from the
  index/stash without reading it — a staged copy may differ from HEAD.
  (A real key shipped this way once: staged into .env.example, then the file was
  renamed; `git checkout --` resurrected the keyed copy and it got committed.)
- After any `await` in stateful code, re-check the state before mutating it; store
  snapshots (`[...arr]`) into records-of-record like transcripts, never live references.
- Validate request bodies at the route boundary: `req.body` can be undefined, and any
  value written into a shared-contract shape gets type-checked there. An async
  Express 4 handler that throws kills the whole process.
- Dev/debug endpoints ship gated: off when `NODE_ENV=production` unless explicitly
  flagged on.
- A bug fix isn't done until a test reproduces it.

## Coding standards

Follow the existing code style in the repo. If a pattern is ambiguous, prefer
the simplest option that matches what's already there.

## Precedence

This file governs this repo and overrides personal/global agent instructions where they
conflict.
