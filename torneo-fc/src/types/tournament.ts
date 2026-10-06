export type TournamentStatus = 'registro' | 'en_curso' | 'finalizado';

export type Tournament = {
  id: number;
  status: TournamentStatus;
  current_round: number;
};

export type TournamentResponse = {
  tournament: Tournament | null;
  current_date: string;
};

export type StandingRow = {
  user_id: string;
  username: string;
  club_name: string;
  logo_url: string | null;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
};

export type MatchStatus = 'programado' | 'en_juego' | 'pendiente' | 'confirmado' | 'disputa';

export type MatchParticipant = {
  id: string;
  username: string;
};

export type Match = {
  id: number;
  round: number;
  home_id: string;
  away_id: string;
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  home?: MatchParticipant | null;
  away?: MatchParticipant | null;
};

export type MatchEvent = {
  id: number;
  match_id: number;
  user_id: string;
  type: 'gol' | 'amarilla' | 'roja';
  player_id: number | null;
  minute: number | null;
  client_id: string;
};

export type Player = {
  id: number;
  name: string;
  position: string;
};

export type SocketMatchMessage = {
  type: string;
  match: Match;
};

export type AdminActionResponse = {
  data: unknown;
};

export type ResolveDisputeRequest = {
  home: number;
  away: number;
};
