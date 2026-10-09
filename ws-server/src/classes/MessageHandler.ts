import { randomUUID } from 'node:crypto';
import type { Room } from '@/classes/Room';
import { Game } from '@/classes/Game';
import { RoomManager, roomManager } from '@/classes/RoomManager';
import type { Stroke } from '@/types/socket-events';
import { SYSTEM_SENDER_ID } from '@/types/socket-events';
import type { TypedServer, TypedSocket } from '@/types/socket';
import {
  clampSettings,
  validColor,
  validPoint,
  validSize,
  validatePlayerName,
} from '@/utils/validate';
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
    // Member rejoin: leaving first would empty and delete a live room.
    const existing = room.getPlayer(socket.id);
    if (existing !== undefined) {
      socket.join(room.roomId);
      socket.data.roomId = room.roomId;
      ack({
        ok: true,
        player: { ...existing },
        settings: room.settings,
        players: room.toPlayersPayload(),
      });
      return;
    }
    const away = room.findAwayByName(nameResult.name);
    if (away !== undefined) {
      cancelRemoval(away.id);
      const oldId = away.id;
      away.id = socket.id;
      away.isConnected = true;
      room.game?.remapPlayer(oldId, socket.id);
      socket.join(room.roomId);
      socket.data.roomId = room.roomId;
      ack({
        ok: true,
        player: { ...away },
        settings: room.settings,
        players: room.toPlayersPayload(),
      });
      room.broadcast(io, 'player_joined', { players: room.toPlayersPayload() });
      announce(io, room, `${away.name} reconnected.`);
      if (
        room.game !== null &&
        room.game.phase !== 'LOBBY' &&
        room.game.phase !== 'GAME_OVER'
      ) {
        socket.emit('game_state', room.game.snapshot());
        socket.emit('hint_update', { hints: room.game.getHints() });
      }
      return;
    }
    const leftRoom = leaveCurrentRoom(socket, manager);
    if (leftRoom !== undefined && leftRoom !== room) {
      leftRoom.game?.onPlayerLeft(socket.id);
    }
    const result = room.addPlayer(new Player(socket.id, nameResult.name));
    if (!result.ok) {
      ack({ ok: false, error: result.error });
      return;
    }
    socket.join(room.roomId);
    socket.data.roomId = room.roomId;
    ack({
      ok: true,
      player: { ...result.player },
      settings: room.settings,
      players: room.toPlayersPayload(),
    });
    room.broadcast(io, 'player_joined', { players: room.toPlayersPayload() });
    announce(io, room, `${result.player.name} joined the room.`);
    // Late joiners mid-game get a snapshot so their UI matches the phase.
    if (
      room.game !== null &&
      room.game.phase !== 'LOBBY' &&
      room.game.phase !== 'GAME_OVER'
    ) {
      socket.emit('game_state', room.game.snapshot());
      socket.emit('hint_update', { hints: room.game.getHints() });
    }
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
    if (room.players.filter((p) => p.isConnected).length < MIN_PLAYERS_TO_START) {
      ack({
        ok: false,
        error: `Need at least ${MIN_PLAYERS_TO_START} players to start.`,
      });
      return;
    }
    if (room.game !== null && room.game.phase !== 'GAME_OVER') {
      ack({ ok: false, error: 'Game already in progress.' });
      return;
    }
    room.game = new Game(room.settings, {
      getPlayers: () => room.players,
      sendTo: (socketId, event, ...args) => {
        io.to(socketId).emit(event, ...args);
      },
      broadcast: (event, ...args) => {
        room.broadcast(io, event, ...args);
      },
      broadcastExcept: (exceptId, event, ...args) => {
        io.to(room.roomId).except(exceptId).emit(event, ...args);
      },
    });
    room.game.startGame();
    ack({ ok: true });
  });

  socket.on('word_chosen', (payload) => {
    const room = currentRoom(socket, manager);
    // No ack channel in the contract; invalid picks are ignored (only the
    // drawer ever sees options, so these indicate a misbehaving client).
    room?.game?.chooseWord(socket.id, payload.word);
  });

  socket.on('draw_start', (payload) => {
    const ctx = drawingGame(socket, manager);
    if (ctx === undefined) return;
    const { room, game } = ctx;
    const point = validPoint(payload.x, payload.y);
    const size = validSize(payload.size);
    const color = validColor(payload.color);
    if (point === null || size === null || color === null) return;
    const tool = payload.tool === 'eraser' ? 'eraser' : 'brush';
    const stroke: Stroke = {
      id: randomUUID(),
      color,
      size,
      tool,
      points: [point],
    };
    game.strokes.push(stroke);
    game.activeStroke = stroke;
    room.broadcastExcept(io, socket.id, 'draw_data', {
      strokeId: stroke.id,
      x: point.x,
      y: point.y,
      color,
      size,
      tool,
      phase: 'start',
    });
  });

  socket.on('draw_move', (payload) => {
    const ctx = drawingGame(socket, manager);
    if (ctx === undefined) return;
    const { room, game } = ctx;
    const stroke = game.activeStroke;
    if (stroke === null) return;
    const point = validPoint(payload.x, payload.y);
    if (point === null) return;
    stroke.points.push(point);
    room.broadcastExcept(io, socket.id, 'draw_data', {
      strokeId: stroke.id,
      x: point.x,
      y: point.y,
      color: stroke.color,
      size: stroke.size,
      tool: stroke.tool,
      phase: 'move',
    });
  });

  socket.on('draw_end', () => {
    const ctx = drawingGame(socket, manager);
    if (ctx === undefined) return;
    const { room, game } = ctx;
    const stroke = game.activeStroke;
    game.activeStroke = null;
    if (stroke === null) return;
    const last = stroke.points[stroke.points.length - 1] ?? { x: 0, y: 0 };
    room.broadcastExcept(io, socket.id, 'draw_data', {
      strokeId: stroke.id,
      x: last.x,
      y: last.y,
      color: stroke.color,
      size: stroke.size,
      tool: stroke.tool,
      phase: 'end',
    });
  });

  socket.on('undo_stroke', () => {
    const ctx = drawingGame(socket, manager);
    if (ctx === undefined) return;
    const { room, game } = ctx;
    game.activeStroke = null;
    if (game.strokes.pop() === undefined) return;
    room.broadcast(io, 'draw_undo', { strokes: game.strokes });
  });

  socket.on('clear_canvas', () => {
    const ctx = drawingGame(socket, manager);
    if (ctx === undefined) return;
    const { room, game } = ctx;
    game.strokes = [];
    game.activeStroke = null;
    room.broadcast(io, 'canvas_clear');
  });

  socket.on('chat', (payload) => {
    handleChat(io, socket, manager, payload.text);
  });

  socket.on('guess', (payload) => {
    handleChat(io, socket, manager, payload.text);
  });

  socket.on('toggle_ready', (payload, ack) => {
    const room = currentRoom(socket, manager);
    if (room === undefined || room.getPlayer(socket.id) === undefined) {
      ack({ ok: false, error: 'You are not in a room.' });
      return;
    }
    if (
      room.game !== null &&
      room.game.phase !== 'LOBBY' &&
      room.game.phase !== 'GAME_OVER'
    ) {
      ack({ ok: false, error: 'Too late — the game already started.' });
      return;
    }
    room.setReady(socket.id, payload.isReady);
    ack({ ok: true });
    room.broadcast(io, 'lobby_update', { players: room.toPlayersPayload() });
  });

  socket.on('play_again', (ack) => {
    const room = currentRoom(socket, manager);
    const player = room?.getPlayer(socket.id);
    if (room === undefined || player === undefined) {
      ack({ ok: false, error: 'You are not in a room.' });
      return;
    }
    if (!player.isHost) {
      ack({ ok: false, error: 'Only the host can start a new game.' });
      return;
    }
    if (room.game === null || room.game.phase !== 'GAME_OVER') {
      ack({ ok: false, error: 'Finish the current game first.' });
      return;
    }
    for (const p of room.players) {
      p.score = 0;
      p.isReady = false;
      p.hasGuessed = false;
    }
    room.game = null;
    ack({ ok: true });
    room.broadcast(io, 'game_state', {
      phase: 'LOBBY' as const,
      players: room.toPlayersPayload(),
      strokes: [],
      timeLeft: 0,
    });
  });

  socket.on('leave_room', (ack) => {
    lastChatAt.delete(socket.id);
    const leaver = manager.findRoomByPlayer(socket.id)?.getPlayer(socket.id);
    const room = leaveCurrentRoom(socket, manager);
    if (room === undefined) {
      ack({ ok: false, error: 'You are not in a room.' });
      return;
    }
    ack({ ok: true });
    room.game?.onPlayerLeft(socket.id);
    if (!room.isEmpty()) {
      room.broadcast(io, 'player_left', { players: room.toPlayersPayload() });
      if (leaver !== undefined) {
        announce(io, room, `${leaver.name} left the room.`);
      }
    }
  });

  socket.on('disconnect', () => {
    const room = currentRoom(socket, manager);
    socket.data.roomId = undefined;
    lastChatAt.delete(socket.id);
    if (room === undefined) return;
    const player = room.getPlayer(socket.id);
    if (player === undefined) return;
    player.isConnected = false;
    room.game?.onPlayerLeft(socket.id);
    room.broadcast(io, 'player_left', { players: room.toPlayersPayload() });
    announce(io, room, `${player.name} disconnected.`);
    scheduleRemoval(io, manager, room.roomId, socket.id);
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

function drawingGame(
  socket: TypedSocket,
  manager: RoomManager,
): { room: Room; game: Game } | undefined {
  const room = currentRoom(socket, manager);
  const game = room?.game;
  if (room === undefined || game === null || game === undefined) {
    return undefined;
  }
  if (!game.isDrawer(socket.id)) return undefined;
  return { room, game };
}

const MAX_CHAT_LENGTH = 100;
const CHAT_INTERVAL_MS = 300;
const lastChatAt = new Map<string, number>();

function announce(io: TypedServer, room: Room, text: string): void {
  room.broadcast(io, 'chat_message', {
    playerId: SYSTEM_SENDER_ID,
    playerName: 'System',
    text,
  });
}

function sanitizeChat(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, MAX_CHAT_LENGTH);
}

function handleChat(
  io: TypedServer,
  socket: TypedSocket,
  manager: RoomManager,
  rawText: unknown,
): void {
  const room = currentRoom(socket, manager);
  const player = room?.getPlayer(socket.id);
  if (room === undefined || player === undefined) return;
  const now = Date.now();
  if (now - (lastChatAt.get(socket.id) ?? 0) < CHAT_INTERVAL_MS) return;
  lastChatAt.set(socket.id, now);
  const text = sanitizeChat(rawText);
  if (text === '') return;
  const game = room.game;
  const guessing =
    game !== null &&
    game !== undefined &&
    game.phase === 'DRAWING' &&
    !game.isDrawer(socket.id) &&
    !player.hasGuessed;
  if (guessing && game !== null && game !== undefined) {
    const outcome = game.guess(socket.id, text);
    if (outcome.kind === 'ignored') return;
    if (outcome.kind === 'correct') {
      room.broadcast(io, 'guess_result', {
        correct: true,
        playerId: player.id,
        playerName: player.name,
        points: outcome.points,
      });
      room.broadcast(io, 'lobby_update', { players: room.toPlayersPayload() });
      if (game.allGuessed()) game.endTurn();
      return;
    }
    room.broadcast(io, 'chat_message', {
      playerId: player.id,
      playerName: player.name,
      text,
    });
    if (outcome.kind === 'close') {
      socket.emit('guess_result', {
        correct: false,
        playerId: player.id,
        playerName: player.name,
      });
    }
    return;
  }
  if (
    game !== null &&
    game !== undefined &&
    game.phase === 'DRAWING' &&
    (game.isDrawer(socket.id) || player.hasGuessed)
  ) {
    const drawerId = game.turnOrder[game.currentDrawerIdx];
    for (const member of room.players) {
      if (member.id === drawerId || member.hasGuessed) {
        io.to(member.id).emit('chat_message', {
          playerId: player.id,
          playerName: player.name,
          text,
        });
      }
    }
    return;
  }
  room.broadcast(io, 'chat_message', {
    playerId: player.id,
    playerName: player.name,
    text,
  });
}

const RECONNECT_GRACE_MS = 45000;
const pendingRemovals = new Map<string, ReturnType<typeof setTimeout>>();

function cancelRemoval(socketId: string): void {
  const timer = pendingRemovals.get(socketId);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingRemovals.delete(socketId);
  }
}

function scheduleRemoval(
  io: TypedServer,
  manager: RoomManager,
  roomId: string,
  socketId: string,
): void {
  cancelRemoval(socketId);
  const timer = setTimeout(() => {
    pendingRemovals.delete(socketId);
    const room = manager.getRoom(roomId);
    if (room === undefined) return;
    const gone = room.getPlayer(socketId)?.name;
    room.removePlayer(socketId);
    if (room.isEmpty()) {
      manager.deleteRoom(roomId);
      return;
    }
    room.game?.onPlayerLeft(socketId);
    room.broadcast(io, 'player_left', { players: room.toPlayersPayload() });
    if (gone !== undefined) announce(io, room, `${gone} left the room.`);
  }, RECONNECT_GRACE_MS);
  pendingRemovals.set(socketId, timer);
}

function leaveCurrentRoom(  socket: TypedSocket,
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
