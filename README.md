# scribbly (Doodle Club)

Real-time multiplayer drawing and guessing game inspired by skribbl.io, with an
original "sticker notebook" identity. Create a room, share the link, take turns
drawing while everyone guesses in real time.

Live URL: not deployed yet (see Deployment below).

## Features

- Rooms: create (public/private, categories, custom words, configurable
  settings) and join via code, shareable link, public browser, or random
  matchmaking, with host migration and lobby readiness.
- Moderation: host kick/ban plus majority votekick. Removed players get a
  removal dialog and a way back home; everyone else is notified through the
  roster update and a system message (toasted in the lobby, shown in chat
  in-game).
- Turn engine: server-driven rounds, word selection with auto-pick, draw
  timers, drawer-disconnect skips, 45s reconnect grace with slot restore,
  winner + leaderboard at game over, host-started lobby loop.
- Live canvas: normalized coordinates (identical on all screen sizes),
  14 colors, 3 brush sizes, eraser, undo, clear, late-join canvas sync.
- Guessing: normalized matching, private close-guess nudges, spoiler-free
  chat groups, correct guesses never broadcast.
- Scoring: time + guess-order bonuses for guessers, per-guesser cut for the
  drawer, live scores and round score deltas.
- Hints on a schedule, word modes (Normal / Hidden / Combination), chat with
  system messages, light/dark/system appearance.

## Tech stack

- Frontend: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui,
  HTML5 canvas with pointer events.
- Backend: Node.js + Express + Socket.IO (TypeScript), in-memory rooms.
- The socket contract lives in `shared/socket-events.ts` and is mirrored into
  both apps (see `AGENTS.md`).

## Local setup

Prerequisites: Node.js 20.9+ and npm.

```bash
npm install --prefix ws-server
npm install --prefix webapp/client
cp ws-server/.env.example ws-server/.env
cp webapp/client/.env.example webapp/client/.env.local
npm run dev
```

Client on http://localhost:3000, server on http://localhost:3001. The root
`npm run dev` starts both via `concurrently`.

| Variable | File | Default |
|---|---|---|
| `PORT` | `ws-server/.env` | `3001` |
| `CLIENT_URL` | `ws-server/.env` | `http://localhost:3000` |
| `NEXT_PUBLIC_SERVER_URL` | `webapp/client/.env.local` | `http://localhost:3001` |

Typecheck and lint the server with `npm run typecheck|lint --prefix ws-server`;
lint the client with `npm run lint --prefix webapp/client` and typecheck it
with `npx tsc --noEmit` run inside `webapp/client`.

## Folder structure

```
scribbly/
├── webapp/client/      # Next.js UI (app/, components/, lib/, context/)
├── ws-server/          # Socket.IO authority (classes/, services/, utils/, data/)
├── shared/             # socket-events.ts, source of truth for the contract
├── design.md           # visual direction (Sticker Mischief)
```

## Deployment (planned)

- Frontend → Vercel, backend → Render/Railway (always-on for WebSockets).
- Set `NEXT_PUBLIC_SERVER_URL` on Vercel and `CLIENT_URL` on the backend;
  both use `https`/`wss` in production.
- The realtime server stays separate because serverless functions can't hold
  persistent WebSocket connections. In-memory state means a single backend
  instance (no shared state across instances).
