import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { MatchEvent } from '@/types/tournament';

const STORAGE_KEY = 'torneo-fc.match-event-queue';
let queueMutation: Promise<void> = Promise.resolve();

export type QueuedMatchEvent = {
  matchId: number;
  userId: string;
  clientId: string;
  type: MatchEvent['type'];
  playerId: number | null;
  minute: number | null;
  createdAt: number;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidQueueFields(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['entrada (objeto)'];
  const fields: string[] = [];
  if (!('matchId' in value) || typeof value.matchId !== 'number'
    || !Number.isFinite(value.matchId) || !Number.isInteger(value.matchId) || value.matchId <= 0) {
    fields.push('matchId (entero positivo number)');
  }
  if (!('userId' in value) || typeof value.userId !== 'string' || !uuidPattern.test(value.userId)) {
    fields.push('userId (UUID string)');
  }
  if (!('clientId' in value) || typeof value.clientId !== 'string' || !uuidPattern.test(value.clientId)) {
    fields.push('clientId (UUID string)');
  }
  if (!('type' in value) || (value.type !== 'gol' && value.type !== 'amarilla' && value.type !== 'roja')) {
    fields.push('type (gol|amarilla|roja)');
  }
  if (!('playerId' in value) || !(value.playerId === null
    || (typeof value.playerId === 'number' && Number.isFinite(value.playerId)
      && Number.isInteger(value.playerId) && value.playerId > 0))) {
    fields.push('playerId (entero positivo number o null)');
  }
  if (!('minute' in value) || !(value.minute === null
    || (typeof value.minute === 'number' && Number.isFinite(value.minute) && Number.isInteger(value.minute)))) {
    fields.push('minute (entero number o null)');
  }
  if (!('createdAt' in value) || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) {
    fields.push('createdAt (number finito)');
  }
  return fields;
}

function isQueuedEvent(value: unknown): value is QueuedMatchEvent {
  return invalidQueueFields(value).length === 0;
}

export async function readOfflineQueue(): Promise<QueuedMatchEvent[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn('Se descartó la cola offline porque el JSON guardado está corrupto.', error);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn('Se descartó la cola offline porque su valor raíz no es una lista.');
    return [];
  }
  return parsed.filter((entry: unknown, index: number): entry is QueuedMatchEvent => {
    if (isQueuedEvent(entry)) return true;
    console.warn(`Se descartó la entrada inválida ${index} de la cola offline.`, entry);
    return false;
  });
}

async function writeOfflineQueue(queue: QueuedMatchEvent[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export async function enqueueMatchEvent(
  input: Omit<QueuedMatchEvent, 'clientId' | 'createdAt'>,
): Promise<QueuedMatchEvent> {
  const matchId = Number(input.matchId);
  const entry: QueuedMatchEvent = {
    ...input,
    matchId,
    clientId: Crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const invalidFields = invalidQueueFields(entry);
  if (invalidFields.length > 0) {
    console.error('[offlineQueue] Entrada rechazada. Campos inválidos:', invalidFields, entry);
    throw new Error(`No se pudo encolar el evento. Revisa: ${invalidFields.join(', ')}.`);
  }
  // Serializar las escrituras evita perder eventos cuando se pulsan dos acciones seguidas.
  const mutation = queueMutation.then(async () => {
    const queue = await readOfflineQueue();
    await writeOfflineQueue([...queue, entry]);
  });
  queueMutation = mutation.then(() => undefined, () => undefined);
  await mutation;
  return entry;
}

export async function removeQueuedMatchEvent(clientId: string): Promise<QueuedMatchEvent[]> {
  let updatedQueue: QueuedMatchEvent[] = [];
  const mutation = queueMutation.then(async () => {
    updatedQueue = (await readOfflineQueue()).filter((entry) => entry.clientId !== clientId);
    await writeOfflineQueue(updatedQueue);
  });
  queueMutation = mutation.then(() => undefined, () => undefined);
  await mutation;
  return updatedQueue;
}
