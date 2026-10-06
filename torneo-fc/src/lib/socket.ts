import { io, type Socket } from 'socket.io-client';
import { refreshAuthSession } from '@/lib/api';
import type { Match, Tournament } from '@/types/tournament';

export type MatchSocketEventName =
  | 'match:result_pending'
  | 'match:resolved'
  | 'match:disputed'
  | 'match:updated'
  | 'event:new'
  | 'event:deleted';

export type MatchSocketMessage = {
  type: MatchSocketEventName;
  match: Match;
};

export type TournamentSocketMessage = {
  type: 'tournament:updated';
  match: Tournament;
};

type SocketServerEvents = {
  'match:result_pending': (message: MatchSocketMessage) => void;
  'match:resolved': (message: MatchSocketMessage) => void;
  'match:disputed': (message: MatchSocketMessage) => void;
  'match:updated': (message: MatchSocketMessage) => void;
  'event:new': (message: MatchSocketMessage) => void;
  'event:deleted': (message: MatchSocketMessage) => void;
  'tournament:updated': (message: TournamentSocketMessage) => void;
};

type SocketClientEvents = Record<string, never>;
export type AppSocketInstance = Socket<SocketServerEvents, SocketClientEvents>;

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
let appSocket: AppSocketInstance | null = null;
let activeToken: string | null = null;
const reconnectListeners = new Set<() => void>();
const statusListeners = new Set<(connected: boolean) => void>();
const socketInstanceListeners = new Set<() => void>();
const authRefreshAttempts = new Set<string>();

function notifyStatus(connected: boolean): void {
  statusListeners.forEach((listener) => listener(connected));
}

function notifySocketInstance(): void {
  socketInstanceListeners.forEach((listener) => listener());
}

function isAuthenticationError(message: string): boolean {
  return /token.*(inv[aá]lido|expirado|requerido)|unauthori[sz]ed|authentication failed/i.test(message);
}

export function connectSocket(token: string): AppSocketInstance {
  if (!baseUrl) throw new Error('Configura EXPO_PUBLIC_API_URL para conectar Socket.io.');
  if (appSocket && activeToken === token) {
    if (!appSocket.connected) appSocket.connect();
    return appSocket;
  }

  disconnectSocket();
  activeToken = token;
  appSocket = io(baseUrl, {
    autoConnect: false,
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 30_000,
  });
  const socket = appSocket;
  notifySocketInstance();
  socket.on('connect', () => {
    notifyStatus(true);
    reconnectListeners.forEach((listener) => listener());
  });
  socket.on('disconnect', () => notifyStatus(false));
  socket.on('connect_error', (error) => {
    notifyStatus(false);
    if (
      activeToken !== token
      || !isAuthenticationError(error.message)
      || authRefreshAttempts.has(token)
    ) {
      return;
    }

    authRefreshAttempts.add(token);
    socket.disconnect();
    void refreshAuthSession().then((tokens) => {
      if (!tokens) disconnectSocket(socket);
    }).catch((refreshError: unknown) => {
      console.error('[Socket.io] Falló la renovación de la sesión:', refreshError);
      disconnectSocket(socket);
    });
  });
  socket.connect();
  return socket;
}

export function disconnectSocket(socket: AppSocketInstance | null = appSocket): void {
  socket?.disconnect();
  if (socket === appSocket) {
    appSocket = null;
    activeToken = null;
    notifyStatus(false);
    notifySocketInstance();
  }
}

export function getSocket(): AppSocketInstance | null {
  return appSocket;
}

export function subscribeToSocketInstance(listener: () => void): () => void {
  socketInstanceListeners.add(listener);
  return () => socketInstanceListeners.delete(listener);
}

export function subscribeToSocketReconnect(listener: () => void): () => void {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

export function subscribeToSocketStatus(listener: (connected: boolean) => void): () => void {
  statusListeners.add(listener);
  listener(Boolean(appSocket?.connected));
  return () => statusListeners.delete(listener);
}
