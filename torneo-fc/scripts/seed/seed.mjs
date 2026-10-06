// =====================================================================
// seed.mjs - Seeding de clubes y jugadores desde EA SPORTS FC Ratings
//
// Uso:
//   npm init -y && npm i @supabase/supabase-js dotenv
//   (agrega "type": "module" en package.json)
//   node seed.mjs
//
// .env (NUNCA subir a Git, NUNCA meter en la app):
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=eyJ...
//
// Usa exclusivamente la caché ea_raw.json; no descarga datos de EA.
// =====================================================================
import 'dotenv/config';
import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan variables en .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CACHE = 'ea_raw.json';
const MAX_PER_CLUB = 30;   // plantel máximo por club

const norm = (s) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const LEAGUE_NAME_ALLOWLIST = {
  'Premier League': new Set(['Premier League']),
  LaLiga: new Set(['LALIGA EA SPORTS']),
  'Serie A': new Set(['Serie A Enilive']),
  Bundesliga: new Set(['Bundesliga']),
  'Ligue 1': new Set(["Ligue 1 McDonald's"]),
};

const MALE_GENDER_LABELS = new Set(['futbol masculino', 'male', 'masculino']);

function isMalePlayer(player) {
  if (!Object.prototype.hasOwnProperty.call(player, 'gender')) return true;
  const gender = player.gender;
  if (typeof gender === 'number') return gender === 0;
  if (typeof gender === 'string') return MALE_GENDER_LABELS.has(norm(gender));
  if (typeof gender === 'object' && gender !== null) {
    return gender.id === 0 || MALE_GENDER_LABELS.has(norm(gender.label));
  }
  return false;
}

// ---------------------------------------------------------------------
// Los 25 clubes (top 5 de las 5 ligas). "aliases" = cómo puede llamarse el
// equipo en la API de EA (se compara con igualdad exacta, sin tildes ni
// mayúsculas). Si un club sale con 0 jugadores, mira teams.txt y agrega
// el alias correcto aquí.
// ---------------------------------------------------------------------
const CLUBS = [
  // Premier League
  { league: 'Premier League', country: 'Inglaterra', name: 'Manchester City', aliases: ['manchester city', 'man city'] },
  { league: 'Premier League', country: 'Inglaterra', name: 'Liverpool', aliases: ['liverpool'] },
  { league: 'Premier League', country: 'Inglaterra', name: 'Arsenal', aliases: ['arsenal'] },
  { league: 'Premier League', country: 'Inglaterra', name: 'Chelsea', aliases: ['chelsea'] },
  { league: 'Premier League', country: 'Inglaterra', name: 'Manchester United', aliases: ['manchester united', 'manchester utd', 'man utd', 'man united'] },
  // LaLiga
  { league: 'LaLiga', country: 'España', name: 'Real Madrid', aliases: ['real madrid'] },
  { league: 'LaLiga', country: 'España', name: 'FC Barcelona', aliases: ['fc barcelona', 'barcelona'] },
  { league: 'LaLiga', country: 'España', name: 'Atlético de Madrid', aliases: ['atletico de madrid', 'atletico madrid', 'atl madrid'] },
  { league: 'LaLiga', country: 'España', name: 'Athletic Club', aliases: ['athletic club', 'athletic bilbao'] },
  { league: 'LaLiga', country: 'España', name: 'Real Sociedad', aliases: ['real sociedad'] },
  // Serie A
  { league: 'Serie A', country: 'Italia', name: 'Inter', aliases: ['inter', 'internazionale', 'inter milan', 'lombardia fc'] },
  { league: 'Serie A', country: 'Italia', name: 'Milan', aliases: ['milan', 'ac milan', 'milano fc'] },
  { league: 'Serie A', country: 'Italia', name: 'Juventus', aliases: ['juventus'] },
  { league: 'Serie A', country: 'Italia', name: 'Napoli', aliases: ['napoli', 'ssc napoli'] },
  { league: 'Serie A', country: 'Italia', name: 'Roma', aliases: ['roma', 'as roma'] },
  // Bundesliga
  { league: 'Bundesliga', country: 'Alemania', name: 'Bayern München', aliases: ['fc bayern munchen', 'bayern munchen', 'bayern munich', 'fc bayern'] },
  { league: 'Bundesliga', country: 'Alemania', name: 'Bayer Leverkusen', aliases: ['bayer 04 leverkusen', 'bayer leverkusen', 'leverkusen'] },
  { league: 'Bundesliga', country: 'Alemania', name: 'Borussia Dortmund', aliases: ['borussia dortmund', 'dortmund'] },
  { league: 'Bundesliga', country: 'Alemania', name: 'RB Leipzig', aliases: ['rb leipzig', 'leipzig'] },
  { league: 'Bundesliga', country: 'Alemania', name: 'Eintracht Frankfurt', aliases: ['eintracht frankfurt', 'frankfurt'] },
  // Ligue 1
  { league: 'Ligue 1', country: 'Francia', name: 'Paris Saint-Germain', aliases: ['paris saint-germain', 'paris sg', 'psg'] },
  { league: 'Ligue 1', country: 'Francia', name: 'Olympique de Marseille', aliases: ['olympique de marseille', 'marseille', 'olympique marseille', 'o. marsella'] },
  { league: 'Ligue 1', country: 'Francia', name: 'AS Monaco', aliases: ['as monaco', 'monaco'] },
  { league: 'Ligue 1', country: 'Francia', name: 'Olympique Lyonnais', aliases: ['olympique lyonnais', 'olympique lyon', 'lyon'] },
  { league: 'Ligue 1', country: 'Francia', name: 'LOSC Lille', aliases: ['losc lille', 'lille', 'lille osc'] },
];

// ---------------------------------------------------------------------
// 1. Leer la caché local; no se realizan solicitudes a EA.
// ---------------------------------------------------------------------
async function fetchAll() {
  try {
    const cached = JSON.parse(await fs.readFile(CACHE, 'utf8'));
    if (!Array.isArray(cached)) throw new Error('la raíz del JSON no es una lista');
    console.log(`Usando caché ${CACHE} (${cached.length} jugadores)`);
    return cached;
  } catch (error) {
    throw new Error(`No se pudo leer la caché ${CACHE}; no se descargará de EA: ${error.message}`);
  }
}

// ---------------------------------------------------------------------
// 2. Normalizar un jugador. Si la API usa otros nombres de campo, ajusta
//    SOLO esta función (el script imprime las claves del primer item).
// ---------------------------------------------------------------------
// La API trae "birthdate": "12/20/1998 0:00" (mes/día/año). Se calcula la edad.
function ageFrom(birthdate) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(birthdate ?? '');
  if (!m) return null;
  const [, mo, d, y] = m.map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
  return age;
}

const toPlayer = (it) => ({
  name: it.commonName || [it.firstName, it.lastName].filter(Boolean).join(' ') || it.name || null,
  position: it.position?.shortLabel ?? it.position?.label ?? null,
  overall: it.overallRating ?? it.ovr ?? it.overall ?? null,
  nationality: it.nationality?.label ?? it.nationality?.name ?? null,
  age: it.age ?? ageFrom(it.birthdate),
  photo_url: it.avatarUrl ?? it.imageUrl ?? null,
  league: it.leagueName ?? '',
  team: it.team?.label ?? it.team?.name ?? '',
  teamLogo: it.team?.imageUrl ?? null,
  gender: it.gender,
});

// ---------------------------------------------------------------------
// 3. Main
// ---------------------------------------------------------------------
const raw = await fetchAll();
console.log('Claves del primer item:', Object.keys(raw[0] ?? {}));

const players = raw.filter(isMalePlayer).map(toPlayer).filter((p) => p.name && p.team);

// Guarda todos los nombres de equipo distintos, para depurar alias.
const teamNames = [...new Set(players.map((p) => p.team))].sort();
await fs.writeFile('teams.txt', teamNames.join('\n'));

// El alias del equipo debe coincidir junto con la liga masculina permitida.
const byClub = new Map(CLUBS.map((c) => [c.name, { club: c, players: [], logo: null }]));
for (const p of players) {
  const t = norm(p.team);
  const hit = CLUBS.find((c) =>
    c.aliases.includes(t) && LEAGUE_NAME_ALLOWLIST[c.league]?.has(p.league),
  );
  if (!hit) continue;
  const bucket = byClub.get(hit.name);
  bucket.logo ??= p.teamLogo;
  bucket.players.push(p);
}

// ---- Diagnóstico: para cada club sin coincidencia, mostrar qué nombres hay en EA ----
console.log(`\nJugadores en la respuesta de EA: ${raw.length} | equipos distintos: ${teamNames.length}`);
for (const { club, players: list } of byClub.values()) {
  if (list.length > 0) continue;
  const words = [club.name, ...club.aliases].flatMap((s) => norm(s).split(/\s+/)).filter((w) => w.length >= 4);
  const byWord = teamNames.filter((t) => words.some((w) => norm(t).includes(w)));
  const leagueKey = norm(club.league).split(' ')[0]; // "serie", "ligue", ...
  const inLeague = [...new Set(players.filter((p) => norm(p.league).includes(leagueKey)).map((p) => p.team))].sort();
  console.log(`\n❓ ${club.name} (${club.league})`);
  console.log('   Nombres parecidos en EA:', byWord.length ? byWord : '(ninguno)');
  console.log(`   Equipos de esa liga en EA (${inLeague.length}):`, inLeague.length ? inLeague.join(' | ') : '(ninguno)');
}
console.log('');

// Upsert de clubes y jugadores
let totalPlayers = 0;
for (const { club, players: list, logo } of byClub.values()) {
  if (list.length === 0) {
    console.warn(`⚠ ${club.name}: 0 jugadores. Revisa teams.txt y agrega el alias correcto.`);
    continue;
  }

  const { data: clubRow, error: clubErr } = await sb
    .from('clubs')
    .upsert(
      { name: club.name, league: club.league, country: club.country, logo_url: logo },
      { onConflict: 'name,league' },
    )
    .select('id')
    .single();
  if (clubErr) throw new Error(`clubs/${club.name}: ${clubErr.message}`);

  // Top N por overall, sin nombres repetidos (la tabla tiene UNIQUE(club_id, name))
  const unique = new Map();
  for (const p of list.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))) {
    if (unique.size >= MAX_PER_CLUB) break;
    if (!unique.has(p.name)) unique.set(p.name, p);
  }
  const rows = [...unique.values()].map((p) => ({
    club_id: clubRow.id,
    name: p.name,
    position: p.position,
    overall: p.overall,
    nationality: p.nationality,
    age: p.age,
    photo_url: p.photo_url,
  }));

  const { error: plErr } = await sb.from('players').upsert(rows, { onConflict: 'club_id,name' });
  if (plErr) throw new Error(`players/${club.name}: ${plErr.message}`);

  const keepNames = new Set(rows.map((row) => row.name));
  const { data: existingPlayers, error: existingErr } = await sb
    .from('players')
    .select('id, name')
    .eq('club_id', clubRow.id);
  if (existingErr) throw new Error(`players/${club.name} (lectura para limpiar): ${existingErr.message}`);

  const stalePlayers = (existingPlayers ?? []).filter((player) => !keepNames.has(player.name));
  if (stalePlayers.length > 0) {
    const staleIds = stalePlayers.map((player) => player.id);
    const { error: deleteErr } = await sb.from('players').delete().in('id', staleIds);
    if (deleteErr) {
      console.error(`No se pudieron borrar jugadores obsoletos de ${club.name}:`, deleteErr);
      if (deleteErr.code === '23503') {
        const [eventsResult, lineupsResult] = await Promise.all([
          sb.from('match_events').select('id, match_id, user_id, player_id').in('player_id', staleIds),
          sb.from('lineups').select('user_id, positions'),
        ]);
        if (eventsResult.error) {
          console.error(`No se pudieron consultar los match_events bloqueantes de ${club.name}:`, eventsResult.error);
        } else {
          console.error(`match_events que bloquean el borrado de ${club.name}:`, eventsResult.data);
        }
        if (lineupsResult.error) {
          console.error(`No se pudieron consultar lineups de ${club.name}:`, lineupsResult.error);
        } else {
          const staleIdSet = new Set(staleIds.map(String));
          const blockingLineups = (lineupsResult.data ?? []).filter((lineup) => {
            const positions = lineup.positions;
            if (typeof positions !== 'object' || positions === null) return false;
            return Object.keys(positions).some((playerId) => staleIdSet.has(playerId));
          });
          console.error(`lineups que referencian jugadores obsoletos de ${club.name}:`, blockingLineups);
        }
      } else {
        throw new Error(`players/${club.name} (limpieza): ${deleteErr.message}`);
      }
    } else {
      console.log(`  Limpieza ${club.name}: ${stalePlayers.length} jugadores obsoletos eliminados`);
    }
  }

  totalPlayers += rows.length;
  console.log(`✔ ${club.league.padEnd(15)} ${club.name.padEnd(24)} ${rows.length} jugadores`);
}

console.log(`\nListo: ${totalPlayers} jugadores cargados.`);
