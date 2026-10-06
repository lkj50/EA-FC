export type FormationName = '4-3-3' | '4-4-2';

export type NormalizedPosition = {
  x: number;
  y: number;
};

export type LineupResponse = {
  user_id: string;
  formation: string;
  positions: Record<string, NormalizedPosition>;
  updated_at: string;
};

export type ClubPlayer = {
  id: number;
  name: string;
  position: string;
  overall: number | null;
};

export type PositionGroup = 'POR' | 'DEF' | 'MED' | 'DEL';
export type FormationRole = Exclude<PositionGroup, 'POR'> | 'POR';

export type FormationSlot = NormalizedPosition & {
  role: FormationRole;
};

export const PLAYER_POSITION_GROUPS: Readonly<Record<string, PositionGroup>> = {
  POR: 'POR',
  DFC: 'DEF',
  LD: 'DEF',
  LI: 'DEF',
  MC: 'MED',
  MCD: 'MED',
  MCO: 'MED',
  MD: 'MED',
  MI: 'MED',
  DC: 'DEL',
  ED: 'DEL',
  EI: 'DEL',
};

export const FORMATIONS: Readonly<Record<FormationName, readonly FormationSlot[]>> = {
  '4-3-3': [
    { role: 'POR', x: 0.5, y: 0.91 },
    { role: 'DEF', x: 0.12, y: 0.75 },
    { role: 'DEF', x: 0.37, y: 0.75 },
    { role: 'DEF', x: 0.63, y: 0.75 },
    { role: 'DEF', x: 0.88, y: 0.75 },
    { role: 'MED', x: 0.22, y: 0.51 },
    { role: 'MED', x: 0.5, y: 0.51 },
    { role: 'MED', x: 0.78, y: 0.51 },
    { role: 'DEL', x: 0.16, y: 0.25 },
    { role: 'DEL', x: 0.5, y: 0.25 },
    { role: 'DEL', x: 0.84, y: 0.25 },
  ],
  '4-4-2': [
    { role: 'POR', x: 0.5, y: 0.91 },
    { role: 'DEF', x: 0.12, y: 0.75 },
    { role: 'DEF', x: 0.37, y: 0.75 },
    { role: 'DEF', x: 0.63, y: 0.75 },
    { role: 'DEF', x: 0.88, y: 0.75 },
    { role: 'MED', x: 0.12, y: 0.5 },
    { role: 'MED', x: 0.37, y: 0.5 },
    { role: 'MED', x: 0.63, y: 0.5 },
    { role: 'MED', x: 0.88, y: 0.5 },
    { role: 'DEL', x: 0.36, y: 0.25 },
    { role: 'DEL', x: 0.64, y: 0.25 },
  ],
};

export function isFormationName(value: string): value is FormationName {
  return value === '4-3-3' || value === '4-4-2';
}
