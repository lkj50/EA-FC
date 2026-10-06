import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import type { Match } from '@/types/tournament';

type UseMatchesOptions = {
  round?: number | null;
  mineOnly?: boolean;
  includeDisputes?: boolean;
};

function roundPath(round: number | null | undefined): string {
  return round === null || round === undefined ? '/matches' : `/matches?round=${round}`;
}

export function useMatches({
  round = null,
  mineOnly = false,
  includeDisputes = false,
}: UseMatchesOptions = {}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [disputes, setDisputes] = useState<Match[]>([]);
  const [maximumRound, setMaximumRound] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [visibleSource, schedule, disputeMatches] = await Promise.all([
        api.get<Match[]>(mineOnly ? '/matches/mine' : roundPath(round)),
        mineOnly || round !== null ? api.get<Match[]>('/matches') : Promise.resolve(null),
        includeDisputes ? api.get<Match[]>('/admin/disputes') : Promise.resolve(null),
      ]);

      const visibleMatches = round === null || round === undefined
        ? visibleSource
        : visibleSource.filter((match) => match.round === round);
      setMatches(visibleMatches);
      const scheduleRows = schedule ?? visibleSource;
      setMaximumRound((current) => Math.max(current, ...scheduleRows.map((match) => match.round), 0));
      if (disputeMatches) setDisputes(disputeMatches);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los partidos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [includeDisputes, mineOnly, round]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { matches, disputes, maximumRound, loading, refreshing, error, refresh };
}
