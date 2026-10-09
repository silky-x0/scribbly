import type { Room } from '@/classes/Room';
import { RoomManager, roomManager } from '@/classes/RoomManager';
import type { TypedServer, TypedSocket } from '@/types/socket';
import { clampSettings, validatePlayerName } from '@/utils/validate';
import { Player } from '@/classes/Player';

export const MIN_PLAYERS_TO_START = 2;

export function registerHandlers(
  io: TypedServer,
  socket: TypedSocket,
  manager: RoomManager = roomManager,
): void {
  socket.on('create_room', (payload, ack) => {
    const nameResult = validatePlayerName(payload.name);
    if (!nameResult.ok) {
      ack({ ok: false, error: nameResult.error });
      return;
    }
    const room = manager.createRoom(clampSettings(payload.settings));
    const added = room.addPlayer(new Player(socket.id, nameResult.name, true));
    if (!added.ok) {
      // Unreachable for a fresh room, but never leak an empty room.
      manager.deleteRoom(room.roomId);
      ack({ ok: false, error: added.error });
      return;
    }
    socket.join(room.roomId);
    socket.data.roomId = room.roomId;
    ack({
      ok: true,
      roomId: room.roomId,
      player: { ...added.player },
      settings: room.settings,
    });
  });

  socket.on('join_room', (payload, ack) => {
    const room = manager.getRoom(payload.roomId);
    if (room === undefined) {
      ack({ ok: false, error: 'Room not found.' });
      return;
    }
    const nameResult = validatePlayerName(payload.name);
    if (!nameResult.ok) {
      ack({ ok: false, error: nameResult.error });
      return;
    }
    leaveCurrentRoom(socket, manager);
    const result = room.addPlayer(new Player(socket.id, nameResult.name));
    if (!result.ok) {
      ack({ ok: false, error: result.error });
      return;
    }
    socket.join(room.roomId);
    socket.data.roomId = room.roomId;
    ack({ ok: true, player: { ...result.player }, settings: room.settings });
    room.broadcast(io, 'player_joined', { players: room.toPlayersPayload() });
  });

  socket.on('start_game', (ack) => {
    const room = currentRoom(socket, manager);
    if (room === undefined) {
      ack({ ok: false, error: 'You are not in a room.' });
      return;
    }
    const player = room.getPlayer(socket.id);
    if (player === undefined) {
      ack({ ok: false, error: 'You are not in this room.' });
      return;
    }
    if (!player.isHost) {
      ack({ ok: false, error: 'Only the host can start the game.' });
      return;
    }
    if (room.players.length < MIN_PLAYERS_TO_START) {
      ack({
        ok: false,
        error: `Need at least ${MIN_PLAYERS_TO_START} players to start.`,
      });
      return;
    }
    // Phase 3 turns this into the real turn-based state machine.
    ack({ ok: true });
  });

  socket.on('toggle_ready', (payload, ack) => {
    const room = currentRoom(socket, manager);
    if (room === undefined || !room.setReady(socket.id, payload.isReady)) {
      ack({ ok: false, error: 'You are not in a room.' });
      return;
    }
    ack({ ok: true });
    room.broadcast(io, 'lobby_update', { players: room.toPlayersPayload() });
  });

  socket.on('leave_room', (ack) => {
    const room = leaveCurrentRoom(socket, manager);
    if (room === undefined) {
      ack({ ok: false, error: 'You are not in a room.' });
      return;
    }
    ack({ ok: true });
    if (!room.isEmpty()) {
      room.broadcast(io, 'player_left', { players: room.toPlayersPayload() });
    }
  });

  socket.on('disconnect', () => {
    const room = leaveCurrentRoom(socket, manager);
    if (room !== undefined && !room.isEmpty()) {
      room.broadcast(io, 'player_left', { players: room.toPlayersPayload() });
    }
  });
}

function currentRoom(
  socket: TypedSocket,
  manager: RoomManager,
): Room | undefined {
  const roomId = socket.data.roomId;
  if (roomId === undefined) {
    return manager.findRoomByPlayer(socket.id);
  }
  return manager.getRoom(roomId);
}

/**
 * Remove the socket from its current room (if any). Deletes the room when it
 * becomes empty. Returns the room it left, if any.
 */
function leaveCurrentRoom(
  socket: TypedSocket,
  manager: RoomManager,
): Room | undefined {
  const room =
    socket.data.roomId !== undefined
      ? manager.getRoom(socket.data.roomId)
      : manager.findRoomByPlayer(socket.id);
  socket.data.roomId = undefined;
  if (room === undefined) {
    return undefined;
  }
  room.removePlayer(socket.id);
  socket.leave(room.roomId);
  if (room.isEmpty()) {
    manager.deleteRoom(room.roomId);
  }
  return room;
}
