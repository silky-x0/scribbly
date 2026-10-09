# ARCHITECTURE — scribbly (Doodle Club)

> Real-time multiplayer drawing & guessing game (skribbl.io clone).
> Next.js UI + standalone Socket.IO authority. This document is the
> implementation truth: how the system is structured, how it runs,
> and **which decisions were taken and why**.

## Contents

1. [Overview & principles](#1-overview--principles)
2. [High-level architecture](#2-high-level-architecture)
3. [Repository layout](#3-repository-layout)
4. [Client architecture (Next.js)](#4-client-architecture-nextjs)
5. [Server architecture (Node + Socket.IO)](#5-server-architecture-node--socketio)
6. [Shared contract](#6-shared-contract)
7. [Data & state models](#7-data--state-models)
8. [Socket & HTTP reference](#8-socket--http-reference)
9. [Game state machine & turn lifecycle](#9-game-state-machine--turn-lifecycle)
10. [Drawing sync pipeline](#10-drawing-sync-pipeline)
11. [Guessing, chat, scoring & hints](#11-guessing-chat-scoring--hints)
12. [Rooms, presence & moderation](#12-rooms-presence--moderation)
13. [Validation, security & anti-cheat](#13-validation-security--anti-cheat)
14. [Configuration & deployment](#14-configuration--deployment)
15. [Decisions taken (ADR summary)](#15-decisions-taken-adr-summary)
16. [Trade-offs, failure modes & limits](#16-trade-offs-failure-modes--limits)

---

## 1. Overview & principles

`scribbly` has two runtimes and one rule:

- **`webapp/client`** — Next.js 16 (App Router) + TypeScript + Tailwind.
  Pure UI layer. Renders state, captures input, never decides truth.
- **`ws-server`** — Node + Express + Socket.IO (TypeScript).
  The **single source of truth** for words, timers, scores, turn order,
  guess verdicts, roles, and room membership.

Guiding principles enforced in code and review (`AGENTS.md`):

1. **Server authority.** If a client could cheat by changing a payload,
   that logic lives on the server.
2. **Thin handlers, fat domain.** Socket handlers validate + route;
   `Room` / `Game` / services compute rules; classes never touch sockets.
3. **Snapshot resync.** Any client can rebuild correct UI from
   `game_state` + `hint_update` + stroke list alone.
4. **Fail closed.** Bad role, bad phase, bad payload → reject / ignore,
   never crash, never leak the word.
5. **No `any`, `strict` TS + clean ESLint** in both apps.

---

## 2. High-level architecture

### 2.1 System diagram

```text
                        ┌───────────────────────────────┐
                        │         Browser tabs          │
                        │  Tab A (drawer)  Tab B/C ...  │
                        └───────┬───────────────┬───────┘
                                │               │
                    Socket.IO (websocket → polling fallback)
                    NEXT_PUBLIC_SERVER_URL (build-time)
                                │               │
┌───────────────────────────────▼───────────────▼───────────────────────────┐
│  webapp/client :3000 — Next.js 16 App Router (UI only, 'use client')     │
│                                                                          │
│  app/page.tsx → LandingPage                                              │
│    create / join / public-room browser / settings modal                  │
│  app/room/[roomId]/page.tsx → Lobby ⇄ GameView switch                    │
│  components/                                                             │
│    landing-page · drawing-demo (offline warm-up canvas)                  │
│    game-view (toolbar + word picker + roster + overlays + timer)         │
│    game-canvas (800×600 fixed buffer, CSS-scaled)                        │
│    chat-panel · settings-form · toaster · ui/*                           │
│  context/SocketContext (tab-lifetime socket provider)                    │
│  lib/socket (module singleton, autoConnect:false) · lib/session          │
│  lib/palette (14 colors × 3 sizes) · lib/server-url                      │
│  types/socket-events.ts (mirror of shared contract)                      │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  ws-server :3001 — Node + Express + Socket.IO (game authority)           │
│                                                                          │
│  index.ts ── bootstrap only ──────────────────────────────┐              │
│    CORS · express.json() · GET /health · GET /api/* · io.on │              │
│    ('connection') → registerHandlers(io, socket)          │              │
│                                                           │              │
│  classes/MessageHandler ── all socket listeners ───────────┤              │
│    validate → Room / Game → targeted emit                  │   io.to() /  │
│                                                           │   broadcast  │
│  classes/RoomManager ── Map<roomId, Room> singleton ───────┤              │
│    createRoom · getRoom · deleteRoom · listPublicRooms     │              │
│    findRoomByPlayer                                        │              │
│                                                           │              │
│  classes/Room ── roster & room scope ──────────────────────┤              │
│    players · host · settings · bannedIds/Ips · votekicks   │              │
│    add/remove · host migrate · broadcast helpers · game?   │              │
│                                                           │              │
│  classes/Game ── turn state machine + timers (io-free) ────┘              │
│    phase · turnOrder · drawerIdx · word/options · timeLeft                │
│    strokes/activeStroke · guessedIds · hints · usedWords                  │
│    GameHooks { getPlayers, sendTo, broadcast, broadcastExcept }           │
│                                                                          │
│  classes/Player ── plain data: id, name, score, isHost,                   │
│    isReady, hasGuessed, isConnected                                       │
│  services/WordService (categorized pool + custom/combine)                 │
│  services/ScoreService (single scoring formula)                          │
│  services/HintService (mask + random reveal)                             │
│  utils/validate · roomCode · text · config/env.config                    │
│  data/words.json · types/socket-events.ts (mirror)                       │
└──────────────────────────────────────────────────────────────────────────┘
```

Transport is Socket.IO with `['websocket', 'polling']` on both ends.
HTTP is only for health and discovery; all gameplay is WebSocket.

### 2.2 Canonical request shape

Every gameplay flow follows the same three steps:

```text
Socket event → MessageHandler (membership? role? phase? rate? sanitize?)
  → Room / Game mutation (pure domain, no `io` inside Game)
    → targeted broadcast (room / except-drawer / single socket)
```

`Game` receives socket capability only through the `GameHooks`
interface, so it is unit-testable without a server. Handlers never
compute game rules; `Game` never imports `socket.io`.

### 2.3 Worked example — a correct guess

```text
Guesser types in ChatPanel → emits `guess { text }`
  → MessageHandler.handleChat:
      in room? → rate-limit 1/300ms → trim, ≤100 chars
      → DRAWING + not drawer + not already guessed? → Game.guess()
  → Game.guess: normalize exact match?
      correct → guesser += 100 + timeBonus(≤400) + orderBonus(60/40/20…)
                drawer  += 50
  → broadcast `guess_result { correct:true, playerId, points }` (NO text)
  → broadcast `lobby_update { players }` (live scores)
  → all non-drawers guessed? → endTurn()
      → broadcast `round_end { word, scores, nextDrawerId }`
      → broadcast system `chat_message "The word was …"`
      → 5s pause → advance() → next WORD_SELECTION
```

Wrong guesses, close-guesses, drawer/guessed-subgroup chat, and system
lines all pass through the **same** `handleChat` pipeline (§11).

---

## 3. Repository layout

```text
scribbly/
├── package.json                  # root: concurrently dev (server :3001 + client :3000)
├── AGENTS.md                     # repo rules (source of scope/architecture constraints)
├── ARCHITECTURE.md               # this file
├── IMPLEMENTATION_PLAN.md        # phased build plan / scope truth
├── shared/socket-events.ts       # SOURCE OF TRUTH for the socket contract
│
├── ws-server/                    # authority
│   └── src/
│       ├── index.ts              # Express + Socket.IO bootstrap, /health, /api/*
│       ├── classes/
│       │   ├── MessageHandler.ts # every socket listener + guards + emits
│       │   ├── RoomManager.ts    # Map<roomId, Room> singleton
│       │   ├── Room.ts           # roster, host, bans, votekicks, broadcast helpers
│       │   ├── Game.ts           # phase machine + timers (io-free via GameHooks)
│       │   └── Player.ts         # plain player data
│       ├── services/
│       │   ├── WordService.ts    # categories, custom words, combine mode, no-repeat
│       │   ├── ScoreService.ts   # guesserPoints() + DRAWER_POINTS_PER_GUESS
│       │   └── HintService.ts    # maskWord() + revealRandomLetter()
│       ├── utils/
│       │   ├── validate.ts       # names, settings clamp, points/sizes/colors
│       │   ├── roomCode.ts       # 5-char code gen + normalization
│       │   ├── text.ts           # normalize + levenshtein (close-guess)
│       │   └── config/env.config.ts # PORT, CLIENT_URL parsing
│       ├── types/
│       │   ├── socket-events.ts  # MIRROR of shared/socket-events.ts
│       │   ├── socket.ts         # TypedServer / TypedSocket / SocketData
│       │   ├── http.ts           # PublicRoomInfo
│       │   └── index.ts
│       └── data/words.json       # animals, food, objects, actions, nature, …
│
└── webapp/client/                # UI only
    └── src/
        ├── app/
        │   ├── layout.tsx        # mounts <SocketProvider>
        │   ├── page.tsx          # landing (create/join/public list)
        │   └── room/[roomId]/page.tsx # lobby ⇄ game switch, invite links
        ├── components/
        │   ├── landing-page.tsx · drawing-demo.tsx
        │   ├── game-view.tsx     # toolbar, picker, roster, timer, overlays
        │   ├── game-canvas.tsx   # 800×600 canvas + pointer capture + throttle
        │   ├── chat-panel.tsx · settings-form.tsx · toaster.tsx · ui/*
        ├── context/SocketContext.tsx # tab-lifetime socket, StrictMode-safe
        ├── lib/
        │   ├── socket.ts         # module singleton, autoConnect:false
        │   ├── session.ts        # sessionStorage name/room persistence
        │   ├── palette.ts        # 14 colors, 3 sizes, token→value resolve
        │   └── server-url.ts
        └── types/socket-events.ts # MIRROR of shared/socket-events.ts
```

Contract sync rule: `shared/socket-events.ts` is copied verbatim into
`ws-server/src/types/socket-events.ts` and
`webapp/client/src/types/socket-events.ts`. Keep all three in sync —
no workspace package by design (§15, D8).

---

## 4. Client architecture (Next.js)

| Concern | Where | Notes |
|---|---|---|
| Routing | `app/page.tsx`, `app/room/[roomId]/page.tsx` | File-based invite links (`/room/ABC12`); `useParams` + `router.push` |
| Socket lifecycle | `lib/socket.ts` + `context/SocketContext.tsx` | One module-level `io()` per tab, `autoConnect:false`; `connect()` in `useEffect`; never disconnect on unmount; status via `useSyncExternalStore` |
| Landing | `components/landing-page.tsx` | Name input, create (settings modal), join by code, public browser via `GET /api/rooms/public` |
| Warm-up canvas | `components/drawing-demo.tsx` | Local-only drawing, no socket; onboarding practice |
| Lobby ↔ game | `app/room/[roomId]/page.tsx` → `game-view.tsx` | Switches on `game_state.phase`; lobby shows roster, host badge, code + copy-link, ready toggle, host start |
| Canvas | `components/game-canvas.tsx` | Fixed `800×600` buffer, CSS scaling; Pointer Events + capture; `touch-action:none`; normalized 0–1 coords; ~30ms throttle + trailing flush; drawer renders locally, guessers render `draw_data` segments |
| Chat/guess input | `components/chat-panel.tsx` | Single input; emits `chat` or `guess`; renders public / subgroup / `system` lines; correct-guess green, system grey |
| Settings | `components/settings-form.tsx` | Mirrors server clamps so host sees valid ranges before submit |
| Feedback | `components/toaster.tsx` | Room-full / not-found / already-started, ack errors |
| Session | `lib/session.ts` | Name + room in `sessionStorage`, read only inside `useEffect` (no SSR hydration mismatch) |
| Assets | self-hosted `woff2` (Syne + Jakarta) | No Google Fonts at build or runtime (Turbopack font pipeline once broke prod) |

SSR discipline: game pages are client-rendered but still prerendered
by Next.js. Anything touching `window`, `sessionStorage`, canvas, or
sockets lives in `'use client'` + `useEffect` / `useSyncExternalStore`.
Session-derived state is never seeded during render — first paint is
always blank-then-live on server and client identically.

StrictMode discipline: dev double-mount must not strand ghosts.
Connection is tab-lifetime (no disconnect on unmount), listeners are
added in effects with `socket.off` cleanup, and joins are idempotent
behind the server ack.

---

## 5. Server architecture (Node + Socket.IO)

`index.ts` is intentionally thin: CORS, JSON, three HTTP routes,
Socket.IO setup, `io.on('connection') → registerHandlers`. All logic
lives one layer down.

| Class / module | Owns | Never does |
|---|---|---|
| `MessageHandler` | Every `socket.on(...)`; membership, role, phase, ban, rate-limit, sanitize; ack `{ok:true…}` / `{ok:false,error}`; calls `Room`/`Game`; emits broadcasts | Game math, word matching, scoring, timer internals |
| `RoomManager` (singleton `roomManager`) | `Map<roomId,Room>`; collision-checked code gen (10 attempts); `get/delete/findByPlayer/listPublicRooms` | Per-room rules, sockets |
| `Room` | `players[]`, `settings`, `game: Game\|null`, `bannedIds/Ips`, `votekicks`; `add/remove`, host migrate (first remaining), `toPlayersPayload`, `broadcast/broadcastExcept` helpers | Timers, word logic, drawing validation |
| `Game` | Phase machine, turn order, word + options, `timeLeft`, `strokes/activeStroke`, `guessedPlayerIds`, `hintsRevealed`, `usedWords`; all timers; `guess/chooseWord/startGame/endTurn/snapshot` | Any `io` import — only `GameHooks` |
| `Player` | Plain data: `id` (socket id), `name`, `score`, `isHost`, `isReady`, `hasGuessed`, `isConnected` | Logic |
| `WordService` | `drawWordOptions(count, usedWords, {categories, combineWords, customWords, customOnly})`, `listCategories()`; avoids repeats until pool exhausts | Sockets, timers |
| `ScoreService` | `guesserPoints(timeLeft, drawTime, guessOrder)` + `DRAWER_POINTS_PER_GUESS = 50` | Anything else |
| `HintService` | `maskWord(word)` (letters→`_`, spaces/punct kept) + `revealRandomLetter(masked, word)` (random hidden slot, never reveals last letter) | Scheduling (Game owns timers) |
| `utils/validate` | `validatePlayerName`, `clampSettings`, `validPoint/validSize/validColor`, custom-word cleaning | Emits |
| `utils/roomCode` + `text` | Code gen/normalize; `normalizeText` + `levenshtein` | — |
| `config/env.config` | `PORT`, `CLIENT_URL` (comma-separated allow-list) parsing | — |

Broadcast primitives: `io.to(roomId).emit` (room),
`io.to(roomId).except(id).emit` (everyone but drawer),
`io.to(socketId).emit` (private: word options, close-guess nudge,
guessed-subgroup chat, reconnect snapshot).

---

## 6. Shared contract

Source: `shared/socket-events.ts`. Mirrors:
`ws-server/src/types/socket-events.ts`,
`webapp/client/src/types/socket-events.ts`.

Core types: `Tool ('brush'|'eraser')`, `Point {x,y: 0–1}`,
`Stroke {id,color,size,tool,points[]}`,
`GamePhase ('LOBBY'|'WORD_SELECTION'|'DRAWING'|'ROUND_END'|'GAME_OVER')`,
`Player {id,name,score,isHost,isReady,hasGuessed,isConnected}`,
`RoomSettings {maxPlayers 2–20, rounds 2–10, drawTime 15–240s,
wordCount 1–5, hints 0–5, wordMode Normal|Hidden|Combination,
isPrivate, categories[], customWords[], customOnly}` (+ `SYSTEM_SENDER_ID='system'`).

Transport: Socket.IO. `C` = client→server, `S` = server→client.
Payloads abbreviated below; the `.ts` file is normative.

---

## 7. Data & state models

- **Room (server):** `roomId` (5-char uppercase alnum), `settings`
  (server-clamped on create), `players[]`, `game: Game|null`,
  `bannedIds/bannedIps` (room-lifetime), `votekicks: Map<targetId, Set<voterId>>`.
- **Player (server):** socket id as `id`; `isConnected=false` marks
  grace-period ghosts (not removal); `hasGuessed` resets each turn.
- **Game (server):** `phase`, `currentRound` (1-based),
  `turnOrder: socketId[]` (fixed at `startGame`; absent slots skipped
  but shape kept), `currentDrawerIdx`, `currentWord|null`,
  `wordOptions[]`, `timeLeft`, `strokes[]`, `activeStroke|null`,
  `guessedPlayerIds`, `hintsRevealed: string[]`, `usedWords`.
- **Stroke (shared):** server-generated `id` (`randomUUID`);
  drawer-local strokes use temporary `local-*` ids and are never trusted.
- **Client view state:** roster + phase + `strokes[]` + `timeLeft` +
  `hints[]` + role flags (`amDrawer`, `haveGuessed`). The client keeps a
  stroke list as the **single render source**; the canvas is a projection
  of it, rebuilt wholesale on every snapshot/undo/clear.

Terminology: a **turn** = one player draws once; a **round** = every
roster slot draws once (absent slots skipped, round shape kept);
a game of N rounds = N × players turns.

---

## 8. Socket & HTTP reference

### 8.1 Client → server

| Event | Payload → server effect |
|---|---|
| `create_room` | `{name, settings}` → ack `{roomId, player, settings}` or `{error}`. Name validated; settings clamped; creator becomes host; `socket.join(roomId)` |
| `join_room` | `{roomId, name}` → ack `{player, settings, players}` or `{error}`. Rejects unknown room, ban, bad name, full room, taken name. Same-socket rejoin + 45s grace restore are idempotent. Mid-game joins also get `game_state` + `hint_update` |
| `start_game` | ack-only. Host-only, ≥2 *connected* players, no running game → builds `Game` + `startGame()` → first `round_start` |
| `toggle_ready` | `{isReady}` → ack → `lobby_update`. Lobby/`GAME_OVER` only |
| `word_chosen` | `{word}` — no ack; must be drawer + offered + in `WORD_SELECTION`, else ignored |
| `draw_start` | `{x,y,color,size,tool}` → creates server stroke (new id), `broadcastExcept` `draw_data{phase:'start'}`. Drawer + `DRAWING` only |
| `draw_move` | `{x,y}` → appends to `activeStroke`, emits `draw_data{phase:'move'}`. Stray moves with no open stroke dropped |
| `draw_end` | `void` → closes `activeStroke`, echoes last point as `draw_data{phase:'end'}` |
| `undo_stroke` | `void` → pops server stroke (no-op if empty) → `draw_undo{strokes}` to room |
| `clear_canvas` | `void` → empties `strokes[]` → `canvas_clear` to room |
| `chat` / `guess` | `{text}` → **one pipeline** (§11). Trimmed, ≤100 chars, 1 per 300ms. Server re-decides guess-vs-chat by role/phase |
| `kick_player` / `ban_player` | `{playerId}` → host-only → eject + force-disconnect (`ban` also adds socket-id + IP to room ban lists). Self-target rejected |
| `votekick` | `{playerId}` → one vote per member; majority of connected non-targets ejects → `votekick_update` each vote |
| `leave_room` | ack-only. Immediate removal (no grace), host migrates, empty room deleted, `player_left` + system line |
| `play_again` | ack-only. Host-only, `GAME_OVER` only → scores cleared, `game=null` → `game_state{phase:LOBBY}` |

### 8.2 Server → client

| Event | Payload → client effect |
|---|---|
| `connected` | `{socketId}` — hello on connect |
| `player_joined` / `player_left` | `{players}` full roster after arrival / departure / kick / expiry |
| `lobby_update` | `{players}` roster refresh (ready flips, live mid-turn scores after each solve) |
| `votekick_update` | `{targetId, votes, needed}` live count after every vote |
| `kicked` | `{reason: 'kicked'│'banned'│'votekicked', message}` — victim only, sent before force-disconnect so their client shows a removal dialog + reconnects instead of freezing |
| `round_start` | `{drawerId, wordOptions\|null, drawTime}` — options **only** to drawer; `null` to everyone else + system `"X is drawing now."` |
| `timer_tick` | `{timeLeft}` 1s countdown while drawing |
| `game_state` | `{phase, players, strokes, timeLeft}` snapshot — turn starts, late joins, reconnects, lobby return |
| `hint_update` | `{hints}` per-character blanks + scheduled reveals |
| `draw_data` | `{strokeId,x,y,color,size,tool,phase:'start'|'move'|'end'}` — room **except drawer** |
| `draw_undo` | `{strokes}` remaining list — clients discard canvas and repaint |
| `canvas_clear` | `void` — clients wipe |
| `chat_message` | `{playerId, playerName, text}` — public, guessed-subgroup, or `system` (joins, leaves, kicks/bans, reveals). In-game `ChatPanel` renders them; in the lobby the room page surfaces `system` lines as toasts |
| `guess_result` | `{correct, playerId, playerName, points?}` — **never carries guess text or the word**; private `correct:false` is the close-guess nudge |
| `round_end` | `{word, scores, nextDrawerId}` — reveal + scoreboard (client computes deltas from turn-start baseline) |
| `game_over` | `{winner, leaderboard}` — winner = earliest top scorer (`topScorerId`), else roster-order tie-break |

### 8.3 HTTP (Express)

| Route | Purpose |
|---|---|
| `GET /health` | `{ok:true, uptime}` — deploy health check |
| `GET /api/rooms/public` | `[{roomId, playerCount, maxPlayers, inGame}]` — public browser (private rooms excluded) |
| `GET /api/words/categories` | `{categories[]}` — from `words.json` keys |

---

## 9. Game state machine & turn lifecycle

```text
LOBBY ── start_game ──▶ WORD_SELECTION ── word_chosen / 15s timeout ──▶ DRAWING
                              │                                                     │
                     drawer leaves                                          timer 0 / all guessed /
                     (skip turn)                                            drawer leaves / <2 left
                              ▼                                                     ▼
                        ROUND_END ◀─────────────────────────────────────────────────┘
                           │  5s pause, word + scores revealed
                           ▼
                ┌─ more turns ──▶ WORD_SELECTION (next drawer, absent slots skipped)
                │
                └─ rounds exhausted ──▶ GAME_OVER ── play_again ──▶ LOBBY
```

| Phase | On entry | Exits when |
|---|---|---|
| `LOBBY` | Roster + settings only; `toggle_ready` allowed | Host `start_game` (≥2 connected) → `WORD_SELECTION` |
| `WORD_SELECTION` | Drawer alone gets `wordOptions`; 15s `wordTimer`; system `"X is drawing now."` | Drawer picks → `DRAWING`; timeout auto-picks random option; drawer leaves → `endTurn` (skip) |
| `DRAWING` | Strokes/guesses/`hasGuessed` reset; `game_state` + initial blanks; 1s `tickTimer` + hint schedule start | Timer 0, all non-drawers guessed, drawer leaves, or <2 connected → `endTurn` |
| `ROUND_END` | `round_end` (word + scores) + system reveal; 5s `pauseTimer` | Pause elapses → `advance()` (next turn) or `finishGame()` |
| `GAME_OVER` | `game_over` (winner + leaderboard) | Host `play_again` → `LOBBY` (scores cleared, `game=null`) |

Turn advancement (`advance()`): `drawerIdx++`; wrap → `round++`;
`round > settings.rounds` → `finishGame()`. `startTurn()` skips
disconnected slots (consumes the slot, keeps round shape); if fewer
than 2 connected remain or every slot was skipped, the game ends early
with current scores.

Server timers (all owned by `Game`, cleared on every terminal path):

| Timer | Schedule | Cancels |
|---|---|---|
| Word pick (15s) | Each turn start | Word chosen, turn ends |
| Draw tick (1s `setInterval`) | Drawing begins | Turn ends |
| Hint reveals (N `setTimeout`s) | Drawing begins, even splits of `drawTime` | Turn ends |
| Round pause (5s) | Turn ends | Fires once, then advances/finishes |
| Reconnect grace (45s) | Socket `disconnect` (MessageHandler) | Same-name rejoin, explicit leave/kick/ban, room deleted |

`clearTimers()` runs at every `startTurn`, `beginDrawing`, `endTurn`,
and `finishGame` — no leaks when rooms empty out.

---

## 10. Drawing sync pipeline

### 10.1 Capture (drawer client — `game-canvas.tsx`)

Pointer Events (`pointerdown/move/up` + `setPointerCapture`) so mouse,
touch, and pen all work. Fixed `800×600` backing buffer scaled by CSS;
`touch-action:none` stops scroll from stealing strokes. Each point is
divided by the canvas's rendered rect into **normalized 0–1 coordinates**
before sending, so phones and monitors render identically. Moves are
throttled to ~30ms with a trailing flush so fast scribbles arrive
complete without flooding the socket. Drawer renders locally
immediately (segment painting with round caps/joins).

### 10.2 Validate (server — `drawingGame` + `valid*`)

`drawingGame()` rejects anything that is not the current drawer in
`DRAWING`. Payloads are then narrowed, never trusted:

| Field | Rule (`utils/validate.ts`) |
|---|---|
| `x, y` | Finite numbers, clamped into `0–1` (`validPoint`; non-numbers dropped) |
| `size` | Finite number, rounded, clamped `1–50px` |
| `color` | Non-empty string, `≤32` chars (palette tokens resolved client-side via `resolveColor`, stored verbatim) |
| `tool` | Explicit `'eraser'` kept, everything else becomes `'brush'` |

Stray `draw_move` without an open stroke and empty-canvas undos are
dropped silently. `undo`/`clear` are drawer-only requests.

### 10.3 Broadcast & render

1. `draw_start` creates the stroke (server `randomUUID`) and announces
   `draw_data{phase:'start'}`; `draw_move` appends + emits
   `{phase:'move'}`; `draw_end` closes and echoes the last point as
   `{phase:'end'}`.
2. All drawing broadcasts go to the room **except the drawer**
   (`broadcastExcept`) — no echo duplicates, less traffic.
3. Guessers paint segments immediately and keep the stroke list as the
   single render source.
4. Undo pops the server stroke and broadcasts the **remaining list**
   (`draw_undo`); clear empties it (`canvas_clear`); turn starts, late
   joins, reconnects, and lobby returns arrive as `game_state`
   snapshots. Every resync path is the same mechanism: **discard the
   canvas and repaint from the stroke list**.
5. Eraser uses `destination-out` on both ends (true erase, not
   background paint) so it works in light and dark mode. Palette tokens
   resolve to concrete values at draw time so all clients see identical
   art regardless of their own theme.

---

## 11. Guessing, chat, scoring & hints

Single `handleChat` pipeline (both `chat` and `guess` events enter it;
the server re-decides by role/phase so neither event can be abused):

1. **Gate:** in-room member? → 300ms rate-limit → `trim().slice(0,100)` →
   empty dropped.
2. **Guessing branch** (`DRAWING` + not drawer + not `hasGuessed`):
   `Game.guess()` → `ignored` (drawer/already-guessed/empty/out-of-phase),
   `correct`, `close` (Levenshtein ≤1, word length >4), or `wrong`.
   - `correct` → room `guess_result{correct:true,…,points}` (**no text**)
     + `lobby_update` (live scores); `allGuessed()` → `endTurn()`.
   - `wrong` → public `chat_message` with the text (it was a miss, safe).
   - `close` → public `chat_message` **plus** private
     `guess_result{correct:false}` nudge to the guesser only.
3. **Spoiler subgroup** (`DRAWING` + drawer or `hasGuessed`): message goes
   only to `drawer + hasGuessed` sockets — solvers can chat without
   spoiling the rest.
4. **Lobby / idle:** public room `chat_message`.

Word matching: `normalize` = trim + lowercase + collapse whitespace;
exact equality wins. Correct-guess text is **never** broadcast; clients
learn only `"PlayerX guessed the word!"` styling.

Scoring (`ScoreService`, one file so it is easy to explain/tune):

```text
guesser = 100 (base) + round(400 × timeLeft / drawTime) + orderBonus
orderBonus = max(0, 60 − 20 × (guessOrder − 1))   // 60 / 40 / 20 / 0…
drawer  += 50 per correct solver (DRAWER_POINTS_PER_GUESS)
nobody solves → drawer gets 0
```

Hints (`HintService` + `Game` schedule): initial `maskWord` blanks
(letters→`_`, spaces/punctuation kept) via `hint_update`; if
`wordMode==='Normal'` and `hints>0`, N reveals are evenly spaced
(`drawTime × i / (hints+1)`), each flipping one random still-hidden
letter, never revealing the last one. `Hidden` mode sends blanks only
(no reveals). `Combination` mode joins two pool words
(`"fire truck"`-style) at option-draw time.

---

## 12. Rooms, presence & moderation

- **Codes:** 5-char uppercase alnum, collision-checked (10 tries, then
  hard error rather than overwrite). Normalized (trim + uppercase) on
  lookup so `ab12c` and `AB12C` match.
- **Create:** name validated (≤20 chars, non-blank), settings
  server-clamped to the ranges in §6; creator joins as host.
- **Join:** rejects unknown rooms, bans, bad names, full rooms, taken
  names. Same-socket rejoins are idempotent; grace-period restores remap
  the old socket id → new id (score, host flag, turn position, guessed
  set preserved); mid-game joins get `game_state` + `hint_update`.
- **Leave vs disconnect:** `leave_room` removes immediately (explicit
  choice, no grace). `disconnect` marks `isConnected=false`, keeps the
  slot for **45s**, then removes. Rejoin with the same name inside the
  window restores the slot; `remapPlayer` keeps turn order intact.
- **Host migration:** removing a host promotes the first remaining
  player. Start and `play_again`/`kick`/`ban` require host.
- **Empty rooms:** deleted immediately on last leave/eject/expiry; all
  `Game` timers cleared first.
- **Start gate:** host-only, ≥2 *connected* (not ghost) players, no game
  in progress.
- **Moderation:** `kick` (rejoinable eject + force-disconnect) vs `ban`
  (room-lifetime socket-id + IP ban). `votekick`: one vote per member,
  self/duplicate/absent rejected, majority of connected non-targets
  (`floor(eligible/2)+1`) ejects, live `votekick_update{votes,needed}`.
  Eject order is remove → `player_left` + system line to the room →
  direct `kicked` to the victim → force-disconnect, so the room sees the
  reason and the victim gets a dialog instead of a frozen screen.
  NAT-shared IPs can overblock — accepted for host-owned party rooms.

---

## 13. Validation, security & anti-cheat

- Role + phase checked in **every** handler (drawer-only drawing/word
  pick, host-only start/kick/ban/play-again, lobby-only ready).
- Word options are emitted **only** to the drawer socket; guessers get
  `null`. The word itself only appears in `round_end` (after the turn)
  and never in `guess_result` / `chat_message`.
- All free text sanitized (trim, whitespace-collapse, length caps:
  chat 100, names 20, custom words 30 × max 50) and rendered escaped.
- Rate limit: 1 chat/guess per 300ms per socket; invalid drawing
  payloads narrowed with `unknown`-first guards (no `any` anywhere).
- Settings are clamped server-side even though the client form mirrors
  the ranges — a malicious client cannot widen rounds/timers/pools.

---

## 14. Configuration & deployment

| Piece | Env | Notes |
|---|---|---|
| `ws-server` | `PORT` (default `3001`), `CLIENT_URL` (comma-separated allow-list) | Runtime env; CORS mirrors it for Express + Socket.IO; single instance (in-memory state) |
| `webapp/client` | `NEXT_PUBLIC_SERVER_URL` (default `http://localhost:3001`) | **Build-time** (inlined by Next) — redeploy after changing; `https` in prod so Socket.IO upgrades to `wss` |
| Local | `npm run dev` (root) | `concurrently`: server `:3001` + client `:3000` |
| Prod (recommended) | Next.js → **Vercel**; Socket.IO → **Render / Railway** (always-on, WebSocket-capable) | `GET /health` as health check; keep `websocket + polling` transports for proxy friendliness |

Fallback (single service): Next.js custom server with Socket.IO
attached, deployed to Render/Railway — works but loses Vercel and
couples UI + realtime. Not used here.

---

## 15. Decisions taken (ADR summary)

| ID | Decision | Why (context) | Alternatives rejected | Consequence |
|---|---|---|---|---|
| D1 | **Separate Socket.IO backend; Next.js UI-only** | Vercel serverless cannot hold WebSockets | Next.js custom server / route-handler sockets | Two deploys, CORS + env wiring; keeps Vercel + independent scaling |
| D2 | **Server is the authority** for words, timers, scores, order, verdicts | Prevents client cheating; one truth for lagging clients | Client-computed countdown / client-scored guesses | More server code, but cheating reduces to self-spoiling |
| D3 | **In-memory `Map<roomId,Room>`, no DB** | Rooms are short-lived party state; zero ops | Redis/Postgres from day one | Restarts wipe rooms; scale = 1 instance or add Redis adapter + stickiness |
| D4 | **Server-owned 1s `timer_tick` broadcast** | Lagging clients cannot stretch turns; single clock | `endsAt` timestamp + client countdown | ~1 msg/s/room chatter (negligible); clock skew harmless |
| D5 | **Normalized 0–1 drawing coordinates** | Phones + monitors render identically | Pixel coords + per-client scaling | Tiny float cost; resolution-independent art |
| D6 | **Drawer renders locally; server relays to others only** | Halves drawing traffic; no echo artifacts | Echo-to-all + dedupe | Drawer/guesser canvases diverge only if a packet drops → healed by next snapshot/undo |
| D7 | **Resync = full snapshot + repaint** (`game_state` / `draw_undo`) | One mechanism covers late join, reconnect, undo, new turn | Operational transforms / deltas | Simple + robust; larger payloads on undo (fine at this stroke count) |
| D8 | **Mirrored contract** (`shared/` copied into both apps) | Zero monorepo tooling | Workspace package / codegen | Manual sync (enforced by `AGENTS.md` convention) |
| D9 | **One guess/chat pipeline** (`handleChat`) | Neither `chat` nor `guess` can be abused; no dead code | Separate handlers with duplicated guards | Slightly subtler control flow, documented in §11 |
| D10 | **Spoiler-safe chat partitioning** (public / guessed-subgroup / system; never broadcast correct text) | Solvers + drawer can talk without leaking | Muting solvers during turns | More emit branches; privacy model must be explained in UI copy |
| D11 | **Scoring: 100 + ≤400 time + 60/40/20 order; drawer +50/solver** | Rewards speed + order; drawer incentivized to draw well | Flat points / average-based drawer share | Tunable in one file (`ScoreService`) |
| D12 | **Hints: even time splits, random hidden slot, keep ≥1 hidden; `Hidden` = blanks only** | Steady help without giveaways | First-letter / interval reveals | Randomness can feel uneven; accepted for party play |
| D13 | **45s reconnect grace (ghosts) + instant explicit leave** | Survives refreshes / blips without losing slot | Instant removal / long sessions | Rosters briefly show ghosts; start counts *connected* only |
| D14 | **Kick vs Ban vs Votekick** (host eject / room IP+socket ban / majority vote + live counts) | Host-owned party rooms need fast moderation | No moderation / admin dashboard | NAT overblocking accepted; bans are room-lifetime only |
| D15 | **SSR-safe + StrictMode-safe client** (`'use client'` + effects, `autoConnect:false` singleton, `sessionStorage` in effects only, self-hosted fonts, `unknown`-narrowed inputs) | Kills hydration mismatches, ghost players, font-pipeline outages | `window` in render / connect-on-import / Google Fonts CDN | Blank-then-live first paint; slightly more effect boilerplate |

---

## 16. Trade-offs, failure modes & limits

- **Drawer drops mid-stroke:** turn skips (`endTurn`), word revealed,
  next drawer starts. Mid-word `WORD_SELECTION` drops behave the same.
- **Room drops below 2 connected:** game ends early with current scores
  (`finishGame`).
- **Everybody drops:** timers self-clear, grace timers expire, empty
  rooms delete — no leaks.
- **Server restart:** all rooms vanish (documented, accepted for
  in-memory design).
- **Undo storms / huge canvases:** full-list `draw_undo` is O(strokes);
  fine for party scale, would need deltas past thousands of strokes.
- **Free-tier cold starts** (Render): wake the backend before demos
  (~30–60s sleep wake).
- **No persistence, no auth, no replay:** scores/rooms live only in
  memory; names are not unique globally; replays/spectators/avatars are
  explicit non-goals (see `IMPLEMENTATION_PLAN.md` Phase 7).
