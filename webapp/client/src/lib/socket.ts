import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket-events';

/** Typed client socket: listens to server events, emits client events. */
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

export const ACK_TIMEOUT_MS = 8000;

/**
 * One socket per tab, created at module scope with autoConnect off so merely
 * importing this module (including during SSR prerender) never connects.
 * The SocketProvider connects inside an effect.
 */
export const socket: AppSocket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: false,
});
