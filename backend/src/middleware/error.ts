import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import type { PostgrestError } from '@supabase/supabase-js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const asyncHandler = (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export function throwSupabaseError(error: PostgrestError, operation: 'rpc' | 'query' = 'query'): never {
  if (error.code === '42501') {
    throw new HttpError(403, 'No tienes permisos para realizar esta acción.');
  }
  if (operation === 'rpc') {
    throw new HttpError(400, error.message);
  }
  throw new HttpError(500, 'Ocurrió un error al consultar la base de datos.');
}

export const errorMiddleware: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (code === '42501') {
      res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
      return;
    }
  }

  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({ error: 'El cuerpo de la solicitud no contiene JSON válido.' });
    return;
  }

  console.error('Error no controlado:', error);
  res.status(500).json({ error: 'Error interno del servidor.' });
};

export function requireBodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'El cuerpo de la solicitud debe ser un objeto JSON.');
  }
  return body as Record<string, unknown>;
}

export function requiredString(
  body: Record<string, unknown>,
  field: string,
  label: string,
  minLength = 1,
  maxLength = 255,
): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length < minLength || value.trim().length > maxLength) {
    throw new HttpError(400, `${label} es obligatorio y debe tener entre ${minLength} y ${maxLength} caracteres.`);
  }
  return value.trim();
}

export function requiredInteger(
  body: Record<string, unknown>,
  field: string,
  label: string,
  min: number,
  max: number,
): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${label} debe ser un número entero entre ${min} y ${max}.`);
  }
  return value;
}

export function requiredUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, `${label} debe ser un UUID válido.`);
  }
  return value;
}

export function requiredPositiveId(value: unknown, label: string): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new HttpError(400, `${label} debe ser un entero positivo.`);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, `${label} debe ser un entero positivo válido.`);
  }
  return id;
}
