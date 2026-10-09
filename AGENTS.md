# AGENTS.md — scribbly (skribbl.io clone)

Real-time multiplayer drawing/guessing game. Next.js UI + standalone Socket.IO server.

## Layout

- `webapp/client/` — Next.js (App Router) + TypeScript + Tailwind. UI layer only.
- `ws-server/` — Node + Express + Socket.IO (TypeScript). Game authority.
- `shared/socket-events.ts` — single source of truth for the socket contract.
  Mirrored (copied) to `ws-server/src/types/socket-events.ts` and
  `webapp/client/src/types/socket-events.ts`. Keep all three in sync.
- `IMPLEMENTATION_PLAN.md` — phased build plan. Source of truth for scope.

## Commands

- `npm run dev` (repo root) — starts server (`:3001`) + client (`:3000`).
- Server: `npm run dev|build|start|lint|typecheck --prefix ws-server`
- Client: `npm run dev|build|lint --prefix webapp/client`
- Env: `ws-server/.env` (`PORT`, `CLIENT_URL`), `webapp/client/.env.local`
  (`NEXT_PUBLIC_SERVER_URL`). Examples in `.env.example` files.

## Architecture rules

- Server is the single source of truth for words, timers, scores, turn order.
  Clients never decide correctness. Validate role + phase in every handler.
- In-memory state (`Map<roomId, Room>`). No DB.
- Drawing coordinates are normalized 0–1 so all screen sizes render identically.
- Never broadcast a correct guess's text, and never send the word to guessers.
- Next.js pages for the game are client-rendered. Anything touching `window`,
  canvas, or sockets must live in a `'use client'` component; read
  `sessionStorage` only inside `useEffect` (no hydration mismatches).
- Socket.IO server must stay separate (Vercel serverless can't hold WebSockets).

## Code rules (all AI agents and humans)

- **Do not use any type, use proper types.** No `any` anywhere — not in
  annotations, generics, or assertions. If a value is genuinely unknown, type it
  `unknown` and narrow it with type guards. This is enforced by
  `@typescript-eslint/no-explicit-any: error` in both eslint configs.
- `strict` TypeScript must pass (`tsc --noEmit`) and `eslint` must be clean.
- Prefer discriminated unions / `Result`-style returns over throwing for
  validation (names, settings, payloads).
- Do not add unnecessary comments. Code should be self-explanatory through
  good names and types; comment only the non-obvious (why, not what) —
  no play-by-play, no restating the code, no obvious docblocks.
- Keep `index.ts` thin: socket handlers go in `MessageHandler`, game rules in
  `services/`, state in `classes/`.
- Don't add deps without need; don't scaffold future phases' code.
- Don't commit unless asked.
