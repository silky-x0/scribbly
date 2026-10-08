import type {
  Player as PlayerPayload,
  RoomSettings,
  ServerToClientEvents,
} from '@/types/socket-events';
import type { TypedServer } from '@/types/socket';
import { normalizeRoomCode } from '@/utils/roomCode';
import type { Player } from '@/classes/Player';

export type AddPlayerResult =
  | { ok: true; player: Player }
  | { ok: false; error: string };

/** Owns the player list, host, and settings of one room. */
export class Room {
  players: Player[] = [];

  constructor(
    public readonly roomId: string,
    public settings: RoomSettings,
  ) {}

  get host(): Player | undefined {
    return this.players.find((p) => p.isHost);
  }

  isEmpty(): boolean {
    return this.players.length === 0;
  }

  isFull(): boolean {
    return this.players.length >= this.settings.maxPlayers;
  }

  getPlayer(socketId: string): Player | undefined {
    return this.players.find((p) => p.id === socketId);
  }

  hasName(name: string): boolean {
    const needle = normalizeRoomCode(name);
    return this.players.some((p) => normalizeRoomCode(p.name) === needle);
  }

  addPlayer(player: Player): AddPlayerResult {
    if (this.isFull()) {
      return { ok: false, error: 'Room is full.' };
    }
    if (this.hasName(player.name)) {
      return { ok: false, error: 'Name is already taken in this room.' };
    }
    this.players.push(player);
    return { ok: true, player };
  }

  /**
   * Remove a player. If the host left, the longest-present remaining player
   * becomes host. Returns the removed player (if any).
   */
  removePlayer(socketId: string): Player | undefined {
    const idx = this.players.findIndex((p) => p.id === socketId);
    if (idx === -1) {
      return undefined;
    }
    const [removed] = this.players.splice(idx, 1);
    if (removed.isHost && this.players.length > 0) {
      const nextHost = this.players[0];
      nextHost.isHost = true;
    }
    return removed;
  }

  toPlayersPayload(): PlayerPayload[] {
    return this.players.map((p) => ({ ...p }));
  }

  broadcast<TEvent extends keyof ServerToClientEvents>(
    io: TypedServer,
    event: TEvent,
    ...args: Parameters<ServerToClientEvents[TEvent]>
  ): void {
    io.to(this.roomId).emit(event, ...args);
  }
}
