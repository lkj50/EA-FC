import { Router } from 'express';
import { getAuthContext } from '../middleware/auth.js';
import { asyncHandler, HttpError, throwSupabaseError } from '../middleware/error.js';

export const rouletteRouter = Router();

function isClubId(value: unknown): boolean {
  return (typeof value === 'string' && value.length > 0)
    || (typeof value === 'number' && Number.isSafeInteger(value));
}

rouletteRouter.post('/', asyncHandler(async (req, res) => {
  const { sb } = getAuthContext(req);
  const { data, error } = await sb.rpc('spin_roulette');
  if (error) throwSupabaseError(error, 'rpc');

  // Las RPC que devuelven filas suelen llegar como arrays, pero la app consume un club.
  const club = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (
    typeof club !== 'object'
    || club === null
    || !('id' in club)
    || !isClubId(club.id)
    || !('name' in club)
    || typeof club.name !== 'string'
  ) {
    throw new HttpError(502, 'La ruleta no devolvió un club válido.');
  }
  res.json(club);
}));
