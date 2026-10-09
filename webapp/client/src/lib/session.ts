import type { RoomSettings } from '@/types/socket-events';

export interface Identity {
  name: string;
  avatar: number;
  language: string;
}

export interface LastRoom {
  roomId: string;
  myId: string;
  settings: RoomSettings;
}

const NAME_KEY = 'scribbly:name';
const AVATAR_KEY = 'scribbly:avatar';
const LANG_KEY = 'scribbly:lang';
const ROOM_KEY = 'scribbly:last-room';

function readString(key: string): string | null {
  try {
    const value = window.sessionStorage.getItem(key);
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function isRoomSettings(value: unknown): value is RoomSettings {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.maxPlayers === 'number' &&
    typeof s.rounds === 'number' &&
    typeof s.drawTime === 'number' &&
    typeof s.wordCount === 'number' &&
    typeof s.hints === 'number' &&
    (s.wordMode === 'Normal' || s.wordMode === 'Hidden' || s.wordMode === 'Combination') &&
    typeof s.isPrivate === 'boolean'
  );
}

/** Identity saved by the landing page. Null when the player never entered. */
export function loadIdentity(): Identity | null {
  const name = readString(NAME_KEY);
  if (name === null) return null;
  const avatarRaw = readString(AVATAR_KEY);
  const avatar = avatarRaw === null ? 0 : Number.parseInt(avatarRaw, 10);
  return {
    name,
    avatar: Number.isInteger(avatar) && avatar >= 0 && avatar < 4 ? avatar : 0,
    language: readString(LANG_KEY) ?? 'English',
  };
}

export function saveIdentity(identity: Identity): void {
  try {
    window.sessionStorage.setItem(NAME_KEY, identity.name);
    window.sessionStorage.setItem(AVATAR_KEY, String(identity.avatar));
    window.sessionStorage.setItem(LANG_KEY, identity.language);
  } catch {
    // Private mode: the game still works for this tab, just not across reloads.
  }
}

export function loadLastRoom(roomId: string): LastRoom | null {
  try {
    const raw: unknown = JSON.parse(
      window.sessionStorage.getItem(ROOM_KEY) ?? 'null',
    );
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (
      r.roomId !== roomId ||
      typeof r.myId !== 'string' ||
      !isRoomSettings(r.settings)
    ) {
      return null;
    }
    return { roomId, myId: r.myId, settings: r.settings };
  } catch {
    return null;
  }
}

export function saveLastRoom(room: LastRoom): void {
  try {
    window.sessionStorage.setItem(ROOM_KEY, JSON.stringify(room));
  } catch {
    // Ignore: live updates still work, only refresh-restore suffers.
  }
}
