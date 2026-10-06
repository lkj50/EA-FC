# Torneo FC

App companion para gestionar un torneo de fútbol: calendario, resultados, tabla, pizarra táctica y eventos en tiempo real.

## Arquitectura

`App Expo (React Native) → REST / Socket.io → Backend Express → Supabase`

La app móvil solo se comunica con el backend. El backend valida sesiones, aplica las políticas RLS de Supabase y reenvía cambios de Supabase Realtime mediante Socket.io.

## Estructura

- `torneo-fc/`: aplicación Expo y `scripts/seed/` para cargar clubes y jugadores.
- `backend/`: API Express/TypeScript y servidor Socket.io.

## Ejecución local

### Seed

Coloca `ea_raw.json` en `torneo-fc/scripts/seed/`, configura las variables desde `.env.example` y ejecuta:

```sh
cd torneo-fc/scripts/seed
npm install
# Copia .env.example a .env y completa los valores localmente.
node seed.mjs
```

### Backend

```sh
cd backend
npm install
# Copia .env.example a .env y completa los valores localmente.
npm run dev
```

### App

```sh
cd torneo-fc
npm install
# Copia .env.example a .env y configura EXPO_PUBLIC_API_URL con la IP local del backend.
npx expo start
```
