export type Tool = 'brush' | 'eraser';

export const SYSTEM_SENDER_ID = 'system';

export interface Point {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface Stroke {
  id: string;
  color: string;
  size: number;
  tool: Tool;
  points: Point[];
}

export type GamePhase =
  | 'LOBBY'
  | 'WORD_SELECTION'
  | 'DRAWING'
  | 'ROUND_END'
  | 'GAME_OVER';

export interface Player {
  id: string; // socket id
  name: string;
  score: number;
  isHost: boolean;
  isReady: boolean;
  hasGuessed: boolean;
  isConnected: boolean;
}

export interface RoomSettings {
  maxPlayers: number; // 2..20
  rounds: number; // 2..10
  drawTime: number; // seconds, 15..240
  wordCount: number; // 1..5 word choices
  hints: number; // 0..5
  wordMode: 'Normal' | 'Hidden' | 'Combination';
  isPrivate: boolean;
}

// ---- Server -> Client events ----
export interface ServerToClientEvents {
  connected: (payload: { socketId: string }) => void;
  // Phases 1+ (declared now so client/server stay in sync):
  player_joined: (payload: { players: Player[] }) => void;
  player_left: (payload: { players: Player[] }) => void;
  lobby_update: (payload: { players: Player[] }) => void;
  round_start: (payload: {
    drawerId: string;
    wordOptions: string[] | null; // null for non-drawers
    drawTime: number;
  }) => void;
  timer_tick: (payload: { timeLeft: number }) => void;
  draw_data: (payload: {
    strokeId: string;
    x: number;
    y: number;
    color: string;
    size: number;
    tool: Tool;
    phase: 'start' | 'move' | 'end';
  }) => void;
  draw_undo: (payload: { strokes: Stroke[] }) => void;
  canvas_clear: () => void;
  hint_update: (payload: { hints: string[] }) => void;
  guess_result: (payload: {
    correct: boolean;
    playerId: string;
    playerName: string;
    points?: number;
  }) => void;
  chat_message: (payload: {
    playerId: string;
    playerName: string;
    text: string;
  }) => void;
  round_end: (payload: {
    word: string;
    scores: Pick<Player, 'id' | 'name' | 'score'>[];
    nextDrawerId: string | null;
  }) => void;
  game_over: (payload: {
    winner: Player | null;
    leaderboard: Player[];
  }) => void;
  game_state: (payload: {
    phase: GamePhase;
    players: Player[];
    strokes: Stroke[];
    timeLeft: number;
  }) => void;
}

// ---- Client -> Server events ----
export interface ClientToServerEvents {
  create_room: (
    payload: { name: string; settings: Partial<RoomSettings> },
    ack: (
      res:
        | { ok: true; roomId: string; player: Player; settings: RoomSettings }
        | { ok: false; error: string },
    ) => void,
  ) => void;
  join_room: (
    payload: { roomId: string; name: string },
    ack: (
      res:
        | { ok: true; player: Player; settings: RoomSettings; players: Player[] }
        | { ok: false; error: string },
    ) => void,
  ) => void;
  start_game: (
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  toggle_ready: (
    payload: { isReady: boolean },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  play_again: (
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  leave_room: (
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
  word_chosen: (payload: { word: string }) => void;
  draw_start: (payload: {
    x: number;
    y: number;
    color: string;
    size: number;
    tool: Tool;
  }) => void;
  draw_move: (payload: { x: number; y: number }) => void;
  draw_end: () => void;
  undo_stroke: () => void;
  clear_canvas: () => void;
  chat: (payload: { text: string }) => void;
  guess: (payload: { text: string }) => void;
}
