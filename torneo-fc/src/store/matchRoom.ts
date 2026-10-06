import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { api, ApiError } from '@/lib/api';
import {
  enqueueMatchEvent,
  readOfflineQueue,
  removeQueuedMatchEvent,
  type QueuedMatchEvent,
} from '@/lib/offlineQueue';
import { useAuthStore } from '@/store/auth';
import type { Match, MatchEvent } from '@/types/tournament';

export type RoomEvent = MatchEvent & {
  syncStatus: 'synced' | 'pending';
};

type MatchRoomState = {
  match: Match | null;
  events: RoomEvent[];
  offlineQueue: QueuedMatchEvent[];
  loading: boolean;
  refreshing: boolean;
  syncing: boolean;
  error: string | null;
  loadMatch: (matchId: number) => Promise<void>;
  refreshEvents: (matchId: number) => Promise<void>;
  startMatch: (matchId: number) => Promise<void>;
  addEvent: (matchId: number, type: MatchEvent['type'], playerId: number | null) => Promise<void>;
  undoEvent: (event: RoomEvent) => Promise<void>;
  submitResult: (matchId: number, home: number, away: number) => Promise<boolean>;
  respondResult: (matchId: number, approve: boolean) => Promise<void>;
  syncOfflineQueue: () => Promise<void>;
  clearError: () => void;
  resetSession: () => void;
};

let queueSync: Promise<void> | null = null;
let roomLoadSequence = 0;

function pendingAsRoomEvent(
  entry: QueuedMatchEvent,
  index: number,
): RoomEvent {
  return {
    id: -(Date.now() * 100 + index),
    match_id: entry.matchId,
    user_id: entry.userId,
    type: entry.type,
    player_id: entry.playerId,
    minute: entry.minute,
    client_id: entry.clientId,
    syncStatus: 'pending',
  };
}

function mergePendingEvents(events: MatchEvent[], queue: QueuedMatchEvent[], userId: string): RoomEvent[] {
  const serverEvents: RoomEvent[] = events.map((event) => ({ ...event, syncStatus: 'synced' }));
  const knownClientIds = new Set(events.map((event) => event.client_id));
  const pendingEvents = queue
    .filter((entry) => entry.userId === userId && !knownClientIds.has(entry.clientId))
    .map((entry, index) => pendingAsRoomEvent(entry, index));
  return [...serverEvents, ...pendingEvents].sort((a, b) => {
    const minuteOrder = (a.minute ?? Number.MAX_SAFE_INTEGER) - (b.minute ?? Number.MAX_SAFE_INTEGER);
    return minuteOrder || a.id - b.id;
  });
}

async function getRoomEvents(matchId: number): Promise<MatchEvent[]> {
  return api.get<MatchEvent[]>(`/matches/${matchId}/events`);
}

export const useMatchRoomStore = create<MatchRoomState>((set, get) => ({
  match: null,
  events: [],
  offlineQueue: [],
  loading: true,
  refreshing: false,
  syncing: false,
  error: null,

  loadMatch: async (matchId) => {
    const requestSequence = ++roomLoadSequence;
    set({
      loading: true,
      refreshing: true,
      error: null,
      ...(get().match?.id === matchId ? {} : { match: null, events: [] }),
    });
    try {
      const matches = await api.get<Match[]>('/matches');
      const match = matches.find((row) => Number(row.id) === matchId);
      if (!match) throw new Error('No se encontró ese partido.');
      if (requestSequence !== roomLoadSequence) return;
      set({ match, error: null });

      try {
        const [events, queue] = await Promise.all([getRoomEvents(matchId), readOfflineQueue()]);
        if (requestSequence !== roomLoadSequence) return;
        const userId = useAuthStore.getState().profile?.id ?? '';
        set({
          events: mergePendingEvents(events, queue.filter((entry) => entry.matchId === matchId), userId),
          offlineQueue: queue,
        });
      } catch (eventsError) {
        if (requestSequence === roomLoadSequence) {
          set({ error: eventsError instanceof Error ? eventsError.message : 'No se pudieron cargar los eventos.' });
        }
      }
    } catch (error) {
      if (requestSequence === roomLoadSequence) {
        set({ error: error instanceof Error ? error.message : 'No se pudo cargar el partido.' });
      }
    } finally {
      if (requestSequence === roomLoadSequence) set({ loading: false, refreshing: false });
    }
  },

  refreshEvents: async (matchId) => {
    try {
      const [events, queue] = await Promise.all([getRoomEvents(matchId), readOfflineQueue()]);
      const userId = useAuthStore.getState().profile?.id ?? '';
      if (get().match?.id === matchId) {
        set({
          events: mergePendingEvents(events, queue.filter((entry) => entry.matchId === matchId), userId),
          offlineQueue: queue,
        });
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'No se pudieron actualizar los eventos.' });
    }
  },

  startMatch: async (matchId) => {
    set({ error: null });
    try {
      await api.post(`/matches/${matchId}/start`, {});
      await get().loadMatch(matchId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'No se pudo iniciar el partido.' });
    }
  },

  addEvent: async (matchId, type, playerId) => {
    set({ error: null });
    try {
      const userId = useAuthStore.getState().profile?.id;
      if (!userId) throw new Error('Inicia sesión para registrar un evento.');
      if (!playerId) throw new Error('Selecciona un jugador de tu club para registrar el evento.');
      const entry = await enqueueMatchEvent({
        matchId,
        userId,
        type,
        playerId,
        minute: null,
      });
      // Se persiste y se pinta antes de enviar; client_id permite reintentar sin duplicados.
      const pending = pendingAsRoomEvent(entry, get().events.length);
      const queue = [...get().offlineQueue, entry];
      set({ events: [...get().events, pending], offlineQueue: queue });

      const connection = await NetInfo.fetch();
      if (connection.isConnected) await get().syncOfflineQueue();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'No se pudo guardar el evento.' });
    }
  },

  undoEvent: async (event) => {
    set({ error: null });
    try {
      if (event.syncStatus === 'pending') {
        const queue = await removeQueuedMatchEvent(event.client_id);
        set({
          offlineQueue: queue,
          events: get().events.filter((candidate) => candidate.client_id !== event.client_id),
        });
        return;
      }
      await api.delete<void>(`/matches/${event.match_id}/events/${event.id}`);
      set({ events: get().events.filter((candidate) => candidate.id !== event.id) });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'No se pudo deshacer el evento.' });
    }
  },

  submitResult: async (matchId, home, away) => {
    set({ error: null });
    try {
      await api.post(`/matches/${matchId}/result`, { home, away });
      const currentMatch = get().match;
      if (currentMatch?.id === matchId) {
        // La RPC aceptó el envío: refleja el estado esperado sin mantener abierto el modal durante el refetch.
        set({
          match: { ...currentMatch, home_score: home, away_score: away, status: 'pendiente' },
        });
      }
      void get().loadMatch(matchId);
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'No se pudo enviar el resultado.' });
      return false;
    }
  },

  respondResult: async (matchId, approve) => {
    set({ error: null });
    try {
      await api.post(`/matches/${matchId}/respond`, { approve });
      await get().loadMatch(matchId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'No se pudo responder el resultado.' });
    }
  },

  syncOfflineQueue: async () => {
    if (queueSync) return queueSync;
    queueSync = (async () => {
      set({ syncing: true });
      try {
        let queue = await readOfflineQueue();
        set({ offlineQueue: queue });
        const userId = useAuthStore.getState().profile?.id ?? '';
        for (const entry of queue) {
          if (entry.userId !== userId) continue;
          try {
            await api.post<MatchEvent>(`/matches/${entry.matchId}/events`, {
              type: entry.type,
              ...(entry.playerId ? { player_id: entry.playerId } : {}),
              ...(entry.minute === null ? {} : { minute: entry.minute }),
              client_id: entry.clientId,
            });
            queue = await removeQueuedMatchEvent(entry.clientId);
            set({ offlineQueue: queue });
            await get().refreshEvents(entry.matchId);
          } catch (error) {
            if (error instanceof ApiError && (error.status === 400 || error.status === 403)) {
              queue = await removeQueuedMatchEvent(entry.clientId);
              set({
                offlineQueue: queue,
                events: get().events.filter((event) => event.client_id !== entry.clientId),
                error: `Se descartó un evento porque el servidor lo rechazó: ${error.message}`,
              });
              if (get().match?.id === entry.matchId) {
                const events = await getRoomEvents(entry.matchId);
                set({
                  events: mergePendingEvents(events, queue.filter((item) => item.matchId === entry.matchId), userId),
                });
              }
              continue;
            }
            // Ante fallos de red se conserva la cola para reintentarla al recuperar conectividad.
            if (error instanceof Error) set({ error: error.message });
            break;
          }
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'No se pudo recuperar la cola offline.' });
      } finally {
        set({ syncing: false });
        queueSync = null;
      }
    })();
    return queueSync;
  },

  clearError: () => set({ error: null }),
  resetSession: () => set({
    match: null,
    events: [],
    offlineQueue: [],
    loading: true,
    refreshing: false,
    syncing: false,
    error: null,
  }),
}));
