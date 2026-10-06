import AsyncStorage from '@react-native-async-storage/async-storage';

export type Club = {
  id: string | number;
  name: string;
  league: string;
  country: string;
  logo_url: string | null;
};

export type Profile = {
  id: string;
  username: string;
  role: 'admin' | 'player';
  created_at: string;
};

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  user: AuthUser;
};

export type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type RegisterResponse = AuthTokens | {
  access_token: null;
  refresh_token: null;
  expires_at: null;
  user: AuthUser | null;
  message: string;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  authenticated?: boolean;
  retryUnauthorized?: boolean;
};

type AuthCallbacks = {
  onTokensRefreshed: (tokens: AuthTokens) => Promise<void>;
  onRefreshFailed: () => Promise<void>;
};

const TOKEN_STORAGE_KEY = 'torneo-fc.auth-tokens';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<AuthTokens | null> | null = null;
let authCallbacks: AuthCallbacks | null = null;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export function setApiTokens(tokens: AuthTokens | null): void {
  accessToken = tokens?.access_token ?? null;
  refreshToken = tokens?.refresh_token ?? null;
}

export function setApiAuthCallbacks(callbacks: AuthCallbacks): void {
  authCallbacks = callbacks;
}

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  setApiTokens(tokens);
  // AsyncStorage conserva la sesión entre reinicios de Expo Go en dispositivos móviles.
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export async function readTokens(): Promise<AuthTokens | null> {
  const stored = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  if (!stored) return null;

  const value: unknown = JSON.parse(stored);
  if (
    typeof value !== 'object'
    || value === null
    || !('access_token' in value)
    || typeof value.access_token !== 'string'
    || !('refresh_token' in value)
    || typeof value.refresh_token !== 'string'
    || !('user' in value)
    || typeof value.user !== 'object'
    || value.user === null
    || !('id' in value.user)
    || typeof value.user.id !== 'string'
  ) {
    throw new Error('La sesión guardada no tiene un formato válido.');
  }

  const expiresAt = 'expires_at' in value && typeof value.expires_at === 'number'
    ? value.expires_at
    : null;
  const email = 'email' in value.user && typeof value.user.email === 'string'
    ? value.user.email
    : undefined;
  const userMetadata = 'user_metadata' in value.user
    && typeof value.user.user_metadata === 'object'
    && value.user.user_metadata !== null
    && !Array.isArray(value.user.user_metadata)
    ? value.user.user_metadata as Record<string, unknown>
    : undefined;

  return {
    access_token: value.access_token,
    refresh_token: value.refresh_token,
    expires_at: expiresAt,
    user: {
      id: value.user.id,
      ...(email ? { email } : {}),
      ...(userMetadata ? { user_metadata: userMetadata } : {}),
    },
  };
}

export function isAuthTokens(value: unknown): value is AuthTokens {
  if (typeof value !== 'object' || value === null) return false;
  if (!('access_token' in value) || typeof value.access_token !== 'string' || !value.access_token) return false;
  if (!('refresh_token' in value) || typeof value.refresh_token !== 'string' || !value.refresh_token) return false;
  return 'user' in value
    && typeof value.user === 'object'
    && value.user !== null
    && 'id' in value.user
    && typeof value.user.id === 'string';
}

export async function clearStoredTokens(): Promise<void> {
  setApiTokens(null);
  await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
}

function getApiUrl(): string {
  if (!API_BASE_URL) {
    throw new Error('Configura EXPO_PUBLIC_API_URL en el archivo .env para conectar con el servidor.');
  }
  return API_BASE_URL;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === 'object'
    && payload !== null
    && 'error' in payload
    && typeof payload.error === 'string'
    && payload.error.trim()
  ) {
    return payload.error;
  }
  return fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('El servidor tardó demasiado en responder.');
    }
    throw new Error('No se pudo conectar con el servidor');
  } finally {
    clearTimeout(timeout);
  }
}

async function decodeResponse<T>(response: Response): Promise<T> {
  const payload: unknown = response.status === 204
    ? null
    : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(getErrorMessage(payload, `Error del servidor (${response.status}).`), response.status);
  }
  return payload as T;
}

async function refreshSession(): Promise<AuthTokens | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    if (!refreshToken) {
      await authCallbacks?.onRefreshFailed();
      return null;
    }

    try {
      const response = await fetchWithTimeout(`${getApiUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const payload = await decodeResponse<unknown>(response);
      if (!isAuthTokens(payload)) {
        throw new Error('El servidor no devolvió tokens válidos.');
      }
      const tokens = payload;
      setApiTokens(tokens);
      await authCallbacks?.onTokensRefreshed(tokens);
      return tokens;
    } catch {
      await authCallbacks?.onRefreshFailed();
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export function refreshAuthSession(): Promise<AuthTokens | null> {
  return refreshSession();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    authenticated = true,
    retryUnauthorized = true,
  } = options;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (authenticated && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetchWithTimeout(`${getApiUrl()}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 401 && authenticated && retryUnauthorized) {
    // Renovar el JWT una sola vez evita pedir al usuario credenciales ante una expiración normal.
    const refreshedTokens = await refreshSession();
    if (!refreshedTokens) {
      throw new Error('Tu sesión venció. Inicia sesión de nuevo.');
    }
    return request<T>(path, { ...options, retryUnauthorized: false });
  }

  if (response.status === 401 && authenticated && !retryUnauthorized) {
    await authCallbacks?.onRefreshFailed();
  }

  return decodeResponse<T>(response);
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body: unknown, authenticated = true): Promise<T> {
    return request<T>(path, { method: 'POST', body, authenticated });
  },
  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PUT', body });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
};

export const authApi = {
  register(body: { email: string; password: string; username: string }): Promise<RegisterResponse> {
    return api.post('/auth/register', body, false);
  },
  login(body: { email: string; password: string }): Promise<AuthTokens> {
    return api.post('/auth/login', body, false);
  },
};

export type MeResponse = {
  profile: Profile | null;
  club: Club | null;
};

export { TOKEN_STORAGE_KEY };
