import { randomInt } from 'node:crypto';

export const ROOM_CODE_LENGTH = 5;

// Uppercase alphanumeric minus ambiguous chars (0/O, 1/I) so codes read
// clearly when shared verbally or in chat.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}
