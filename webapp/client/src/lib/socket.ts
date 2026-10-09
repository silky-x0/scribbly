import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket-events';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

export const ACK_TIMEOUT_MS = 8000;

// autoConnect off: importing (incl. SSR prerender) must never connect.
export const socket: AppSocket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: false,
});
