import { Router } from 'express';
import { getAuthContext } from '../middleware/auth.js';
import { asyncHandler, HttpError, requireBodyObject, requiredString, throwSupabaseError } from '../middleware/error.js';

export const lineupRouter = Router();

function validatePositions(value: unknown): Record<string, { x: number; y: number }> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'positions debe ser un objeto JSON indexado por playerId.');
  }
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [playerId, position] of Object.entries(value)) {
    const isNumericPlayerId = /^\d+$/.test(playerId)
      && Number.isSafeInteger(Number(playerId))
      && Number(playerId) > 0;
    const isUuidPlayerId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(playerId);
    if (!isNumericPlayerId && !isUuidPlayerId) {
      throw new HttpError(400, 'Cada clave de positions debe ser un id de jugador entero positivo.');
    }
    if (typeof position !== 'object' || position === null || Array.isArray(position)) {
      throw new HttpError(400, `La posición del jugador ${playerId} debe incluir x e y.`);
    }
    const coordinates = position as Record<string, unknown>;
    if (typeof coordinates.x !== 'number' || !Number.isFinite(coordinates.x) || coordinates.x < 0 || coordinates.x > 1
      || typeof coordinates.y !== 'number' || !Number.isFinite(coordinates.y) || coordinates.y < 0 || coordinates.y > 1) {
      throw new HttpError(400, `Las coordenadas x e y del jugador ${playerId} deben estar normalizadas entre 0 y 1.`);
    }
    positions[playerId] = { x: coordinates.x, y: coordinates.y };
  }
  return positions;
}

lineupRouter.get('/', asyncHandler(async (req, res) => {
  const { sb, user } = getAuthContext(req);
  const { data, error } = await sb.from('lineups').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throwSupabaseError(error);
  res.json(data);
}));

lineupRouter.put('/', asyncHandler(async (req, res) => {
  const { sb, user } = getAuthContext(req);
  const body = requireBodyObject(req.body);
  const formation = requiredString(body, 'formation', 'La formación', 1, 32);
  const positions = validatePositions(body.positions);
  const { data, error } = await sb.from('lineups').upsert({
    user_id: user.id,
    formation,
    positions,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).select('*').single();
  if (error) throwSupabaseError(error);
  res.json(data);
}));
