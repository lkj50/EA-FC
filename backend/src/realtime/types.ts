export type RealtimeEvent = {
  type: string;
  match: Record<string, unknown>;
};

export type ClientToServerEvents = Record<string, never>;

export type ServerToClientEvents = {
  'match:result_pending': (event: RealtimeEvent) => void;
  'match:resolved': (event: RealtimeEvent) => void;
  'match:disputed': (event: RealtimeEvent) => void;
  'match:updated': (event: RealtimeEvent) => void;
  'event:new': (event: RealtimeEvent) => void;
  'event:deleted': (event: RealtimeEvent) => void;
  'tournament:updated': (event: RealtimeEvent) => void;
};

export type SocketData = {
  userId: string;
  isAdmin: boolean;
};
