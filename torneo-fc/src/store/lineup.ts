import { create } from 'zustand';
import type { FormationName, NormalizedPosition } from '@/types/lineup';

type LineupState = {
  formation: FormationName;
  positions: Record<string, NormalizedPosition>;
  setFormation: (formation: FormationName, positions: Record<string, NormalizedPosition>) => void;
  setPosition: (playerId: number, position: NormalizedPosition) => void;
  restore: (formation: FormationName, positions: Record<string, NormalizedPosition>) => void;
};

export const useLineupStore = create<LineupState>((set) => ({
  formation: '4-3-3',
  positions: {},
  setFormation: (formation, positions) => set({ formation, positions }),
  setPosition: (playerId, position) => set((state) => ({
    positions: { ...state.positions, [playerId]: position },
  })),
  restore: (formation, positions) => set({ formation, positions }),
}));
