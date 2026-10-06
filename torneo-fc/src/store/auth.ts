import { create } from 'zustand';
import {
  api,
  authApi,
  clearStoredTokens,
  isAuthTokens,
  readTokens,
  saveTokens,
  setApiAuthCallbacks,
  setApiTokens,
  type AuthTokens,
  type Club,
  type MeResponse,
  type Profile,
} from '@/lib/api';

export const REGISTER_CONFIRMATION_MESSAGE = 'Revisa tu correo para confirmar la cuenta';

type AuthState = {
  tokens: AuthTokens | null;
  profile: Profile | null;
  club: Club | null;
  loading: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, username: string) => Promise<string | null>;
  signOut: () => Promise<string | null>;
  setClub: (club: Club) => void;
};

let initialization: Promise<void> | null = null;
let initialized = false;

async function loadProfile(): Promise<MeResponse> {
  return api.get<MeResponse>('/me');
}

async function endSession(): Promise<string | null> {
  setApiTokens(null);
  useAuthStore.setState({ tokens: null, profile: null, club: null });
  try {
    await clearStoredTokens();
    return null;
  } catch {
    return 'No se pudo limpiar la sesión guardada en este dispositivo.';
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  tokens: null,
  profile: null,
  club: null,
  loading: true,

  initialize: () => {
    if (initialization) return initialization;
    if (initialized) return Promise.resolve();

    initialization = (async () => {
      set({ loading: true });
      try {
        const tokens = await readTokens();
        if (!tokens) {
          setApiTokens(null);
          set({ tokens: null, profile: null, club: null });
          return;
        }

        setApiTokens(tokens);
        const me = await loadProfile();
        set({ tokens, profile: me.profile, club: me.club });
      } catch {
        await endSession();
      } finally {
        initialized = true;
        set({ loading: false });
      }
    })();
    return initialization;
  },

  signIn: async (email, password) => {
    try {
      const tokens = await authApi.login({ email, password });
      await saveTokens(tokens);
      const me = await loadProfile();
      set({ tokens, profile: me.profile, club: me.club });
      return null;
    } catch (error) {
      await endSession();
      return error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
    }
  },

  signUp: async (email, password, username) => {
    try {
      const response = await authApi.register({ email, password, username });
      if (!isAuthTokens(response)) {
        if ('message' in response && response.message) return REGISTER_CONFIRMATION_MESSAGE;
        throw new Error('El servidor no devolvió una respuesta de registro válida.');
      }
      const tokens = response;
      await saveTokens(tokens);
      const me = await loadProfile();
      set({ tokens, profile: me.profile, club: me.club });
      return null;
    } catch (error) {
      await endSession();
      return error instanceof Error ? error.message : 'No se pudo completar el registro.';
    }
  },

  signOut: async () => endSession(),

  setClub: (club) => set({ club }),
}));

setApiAuthCallbacks({
  onTokensRefreshed: async (tokens) => {
    await saveTokens(tokens);
    useAuthStore.setState({ tokens });
  },
  onRefreshFailed: async () => {
    await useAuthStore.getState().signOut();
  },
});
