import type { PublicRoomInfo } from '@/types/http';
import type { RoomSettings } from '@/types/socket-events';
import { generateRoomCode, normalizeRoomCode } from '@/utils/roomCode';
import { Room } from '@/classes/Room';

export const MAX_CODE_ATTEMPTS = 10;

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(settings: RoomSettings): Room {
    let roomId = generateRoomCode();
    for (let i = 0; this.rooms.has(roomId) && i < MAX_CODE_ATTEMPTS; i += 1) {
      roomId = generateRoomCode();
    }
    // 36^5 ids make a collision after 10 tries effectively impossible;
    // guarding anyway so we never silently overwrite a room.
    if (this.rooms.has(roomId)) {
      throw new Error('Could not generate a unique room code.');
    }
    const room = new Room(roomId, settings);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(rawId: string): Room | undefined {
    return this.rooms.get(normalizeRoomCode(rawId));
  }

  deleteRoom(rawId: string): void {
    this.rooms.delete(normalizeRoomCode(rawId));
  }

  findRoomByPlayer(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.getPlayer(socketId) !== undefined) {
        return room;
      }
    }
    return undefined;
  }

  listPublicRooms(): PublicRoomInfo[] {
    const out: PublicRoomInfo[] = [];
    for (const room of this.rooms.values()) {
      if (!room.settings.isPrivate) {
        const game = room.game;
        out.push({
          roomId: room.roomId,
          playerCount: room.players.length,
          maxPlayers: room.settings.maxPlayers,
          inGame: game !== null && game.phase !== 'LOBBY' && game.phase !== 'GAME_OVER',
        });
      }
    }
    return out;
  }
}

export const roomManager = new RoomManager();
