import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerHandlers } from '@/classes/MessageHandler';
import { roomManager } from '@/classes/RoomManager';
import { env } from '@/config/env.config';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket-events';
import type { SocketData } from '@/types/socket';
import type { DefaultEventsMap } from 'socket.io';

const app = express();
app.use(cors({ origin: env.clientUrls }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/rooms/public', (_req, res) => {
  res.json({ rooms: roomManager.listPublicRooms() });
});

const httpServer = createServer(app);
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>(httpServer, {
  cors: { origin: env.clientUrls },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  console.log(`[ws] connected: ${socket.id}`);
  socket.emit('connected', { socketId: socket.id });
  registerHandlers(io, socket);
});

httpServer.listen(env.port, () => {
  console.log(`[ws-server] listening on :${env.port}`);
  console.log(`[ws-server] allowed origins: ${env.clientUrls.join(', ')}`);
});
