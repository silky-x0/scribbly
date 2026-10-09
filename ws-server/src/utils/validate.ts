import type { Point, RoomSettings } from '@/types/socket-events';

export const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 60,
  wordCount: 3,
  hints: 2,
  wordMode: 'Normal',
  isPrivate: false,
};

const WORD_MODES: RoomSettings['wordMode'][] = [
  'Normal',
  'Hidden',
  'Combination',
];

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampWordMode(value: unknown): RoomSettings['wordMode'] {
  return WORD_MODES.includes(value as RoomSettings['wordMode'])
    ? (value as RoomSettings['wordMode'])
    : DEFAULT_SETTINGS.wordMode;
}


export function clampSettings(input: Partial<RoomSettings>): RoomSettings {
  return {
    maxPlayers: clampInt(input.maxPlayers, DEFAULT_SETTINGS.maxPlayers, 2, 20),
    rounds: clampInt(input.rounds, DEFAULT_SETTINGS.rounds, 2, 10),
    drawTime: clampInt(input.drawTime, DEFAULT_SETTINGS.drawTime, 15, 240),
    wordCount: clampInt(input.wordCount, DEFAULT_SETTINGS.wordCount, 1, 5),
    hints: clampInt(input.hints, DEFAULT_SETTINGS.hints, 0, 5),
    wordMode: clampWordMode(input.wordMode),
    isPrivate:
      typeof input.isPrivate === 'boolean'
        ? input.isPrivate
        : DEFAULT_SETTINGS.isPrivate,
  };
}

export const MAX_NAME_LENGTH = 20;

export type NameValidation =
  | { ok: true; name: string }
  | { ok: false; error: string };

export function validatePlayerName(raw: unknown): NameValidation {  if (typeof raw !== 'string') {
    return { ok: false, error: 'Name must be a string.' };
  }
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length === 0) {
    return { ok: false, error: 'Name must not be empty.' };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `Name must be at most ${MAX_NAME_LENGTH} characters.`,
    };
  }
  return { ok: true, name };
}

const MAX_BRUSH_SIZE = 50;
const MAX_COLOR_LENGTH = 32;

export function validPoint(x: unknown, y: unknown): Point | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

export function validSize(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(MAX_BRUSH_SIZE, Math.max(1, Math.round(value)));
}

export function validColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  if (color.length === 0 || color.length > MAX_COLOR_LENGTH) return null;
  return color;
}
