'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { socket, type AppSocket } from '@/lib/socket';

interface SocketContextValue {
  socket: AppSocket;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue | null>(null);

function subscribeStatus(onChange: () => void): () => void {
  socket.on('connect', onChange);
  socket.on('disconnect', onChange);
  return () => {
    socket.off('connect', onChange);
    socket.off('disconnect', onChange);
  };
}

function getStatusSnapshot(): boolean {
  return socket.connected;
}

function getStatusServerSnapshot(): boolean {
  return false;
}

/**
 * Tab-lifetime connection: never disconnect on unmount (StrictMode-safe).
 * Leaving rooms is explicit via leave_room, so navigation never strands players.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const connected = useSyncExternalStore(
    subscribeStatus,
    getStatusSnapshot,
    getStatusServerSnapshot,
  );

  useEffect(() => {
    socket.connect();
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (ctx === null) {
    throw new Error('useSocket must be used inside <SocketProvider>.');
  }
  return ctx;
}
