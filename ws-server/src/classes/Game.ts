import type {
  GamePhase,
  Player as PlayerPayload,
  RoomSettings,
  ServerToClientEvents,
  Stroke,
} from '../types/socket-events';
import type { Player } from './Player';
import { drawWordOptions } from '../services/WordService';

export const WORD_SELECTION_SECONDS = 15;
export const ROUND_END_PAUSE_MS = 5000;

export interface GameHooks {
  getPlayers: () => Player[];
  sendTo: <TEvent extends keyof ServerToClientEvents>(
    socketId: string,
    event: TEvent,
    ...args: Parameters<ServerToClientEvents[TEvent]>
  ) => void;
  broadcast: <TEvent extends keyof ServerToClientEvents>(
    event: TEvent,
    ...args: Parameters<ServerToClientEvents[TEvent]>
  ) => void;
  broadcastExcept: <TEvent extends keyof ServerToClientEvents>(
    exceptSocketId: string,
    event: TEvent,
    ...args: Parameters<ServerToClientEvents[TEvent]>
  ) => void;
}

export type WordChoice = { ok: true } | { ok: false; error: string };

export class Game {
  phase: GamePhase = 'LOBBY';
  currentRound = 0;
  turnOrder: string[] = [];
  currentDrawerIdx = 0;
  currentWord: string | null = null;
  wordOptions: string[] = [];
  timeLeft = 0;
  strokes: Stroke[] = [];
  guessedPlayerIds = new Set<string>();
  hintsRevealed: string[] = [];
  private usedWords = new Set<string>();
  private wordTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly settings: RoomSettings,
    private readonly hooks: GameHooks,
  ) {}

  startGame(): void {
    for (const p of this.hooks.getPlayers()) {
      p.score = 0;
      p.isReady = false;
      p.hasGuessed = false;
    }
    this.turnOrder = this.hooks.getPlayers().map((p) => p.id);
    this.currentRound = 1;
    this.currentDrawerIdx = 0;
    this.startTurn();
  }

  chooseWord(socketId: string, word: string): WordChoice {
    if (this.phase !== 'WORD_SELECTION') {
      return { ok: false, error: 'Not choosing a word right now.' };
    }
    if (socketId !== this.turnOrder[this.currentDrawerIdx]) {
      return { ok: false, error: 'Only the drawer chooses the word.' };
    }
    if (!this.wordOptions.includes(word)) {
      return { ok: false, error: 'That word was not offered.' };
    }
    this.beginDrawing(word);
    return { ok: true };
  }

  onPlayerLeft(socketId: string): void {
    if (this.phase === 'LOBBY' || this.phase === 'GAME_OVER') return;
    if (this.hooks.getPlayers().length < 2) {
      this.finishGame();
      return;
    }
    if (
      socketId === this.turnOrder[this.currentDrawerIdx] &&
      (this.phase === 'WORD_SELECTION' || this.phase === 'DRAWING')
    ) {
      this.endTurn();
    }
  }

  snapshot(): {
    phase: GamePhase;
    players: PlayerPayload[];
    strokes: Stroke[];
    timeLeft: number;
  } {
    return {
      phase: this.phase,
      players: this.hooks.getPlayers().map((p) => ({ ...p })),
      strokes: [...this.strokes],
      timeLeft: this.timeLeft,
    };
  }

  private startTurn(skips = 0): void {
    this.clearTimers();
    const players = this.hooks.getPlayers();
    if (players.length < 2 || skips >= this.turnOrder.length) {
      this.finishGame();
      return;
    }
    const drawerId = this.turnOrder[this.currentDrawerIdx];
    if (drawerId === undefined || players.every((p) => p.id !== drawerId)) {
      // Slot belongs to someone who left: consume the slot, keep round shape.
      this.currentDrawerIdx =
        (this.currentDrawerIdx + 1) % this.turnOrder.length;
      this.startTurn(skips + 1);
      return;
    }
    this.wordOptions = drawWordOptions(this.settings.wordCount, this.usedWords);
    for (const w of this.wordOptions) this.usedWords.add(w);
    this.currentWord = null;
    this.timeLeft = this.settings.drawTime;
    this.phase = 'WORD_SELECTION';
    const drawTime = this.settings.drawTime;
    this.hooks.sendTo(drawerId, 'round_start', {
      drawerId,
      wordOptions: this.wordOptions,
      drawTime,
    });
    this.hooks.broadcastExcept(drawerId, 'round_start', {
      drawerId,
      wordOptions: null,
      drawTime,
    });
    this.wordTimer = setTimeout(() => {
      this.wordTimer = null;
      if (this.phase !== 'WORD_SELECTION' || this.wordOptions.length === 0) {
        return;
      }
      const fallback =
        this.wordOptions[Math.floor(Math.random() * this.wordOptions.length)];
      if (fallback !== undefined) this.beginDrawing(fallback);
    }, WORD_SELECTION_SECONDS * 1000);
  }

  private beginDrawing(word: string): void {
    this.clearTimers();
    this.currentWord = word;
    this.wordOptions = [];
    this.strokes = [];
    this.guessedPlayerIds = new Set<string>();
    this.hintsRevealed = [];
    for (const p of this.hooks.getPlayers()) p.hasGuessed = false;
    this.timeLeft = this.settings.drawTime;
    this.phase = 'DRAWING';
    this.hooks.broadcast('game_state', this.snapshot());
    this.tickTimer = setInterval(() => {
      this.timeLeft -= 1;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.hooks.broadcast('timer_tick', { timeLeft: 0 });
        this.endTurn();
        return;
      }
      this.hooks.broadcast('timer_tick', { timeLeft: this.timeLeft });
    }, 1000);
  }

  private endTurn(): void {
    if (this.phase !== 'WORD_SELECTION' && this.phase !== 'DRAWING') return;
    this.clearTimers();
    const players = this.hooks.getPlayers();
    const word = this.currentWord ?? '(no word)';
    const scores = players.map((p) => ({ id: p.id, name: p.name, score: p.score }));
    const nextDrawerId =
      this.turnOrder[(this.currentDrawerIdx + 1) % this.turnOrder.length] ??
      null;
    this.phase = 'ROUND_END';
    this.hooks.broadcast('round_end', { word, scores, nextDrawerId });
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null;
      this.advance();
    }, ROUND_END_PAUSE_MS);
  }

  private advance(): void {
    this.currentDrawerIdx += 1;
    if (this.currentDrawerIdx >= this.turnOrder.length) {
      this.currentDrawerIdx = 0;
      this.currentRound += 1;
    }
    if (this.currentRound > this.settings.rounds) {
      this.finishGame();
      return;
    }
    this.startTurn();
  }

  private finishGame(): void {
    this.clearTimers();
    this.phase = 'GAME_OVER';
    // Stable sort: ties keep roster order (longest-present wins ties for now).
    const leaderboard = [...this.hooks.getPlayers()]
      .map((p) => ({ ...p }))
      .sort((a, b) => b.score - a.score);
    const winner = leaderboard[0] ?? null;
    this.hooks.broadcast('game_over', { winner, leaderboard });
  }

  private clearTimers(): void {
    if (this.wordTimer !== null) {
      clearTimeout(this.wordTimer);
      this.wordTimer = null;
    }
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
  }
}
