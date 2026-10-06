import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth';
import { useMatches } from '@/hooks/useMatches';
import { useStandings } from '@/hooks/useStandings';
import { useTournament } from '@/hooks/useTournament';
import { getSocket, subscribeToSocketReconnect } from '@/lib/socket';
import type { Match, MatchStatus } from '@/types/tournament';
import { colors, matchStatusColors, radii, spacing, typography } from '@/theme';

const STATUS_LABELS: Record<MatchStatus, string> = {
  programado: 'Programado',
  en_juego: 'En juego',
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  disputa: 'Disputa',
};

const STATUS_COLORS: Record<MatchStatus, { background: string; text: string; accent: string }> = matchStatusColors;

function MatchCard({
  match,
  currentUserId,
  enabled,
  clubsByUserId,
}: {
  match: Match;
  currentUserId: string | undefined;
  enabled: boolean;
  clubsByUserId: Map<string, string>;
}) {
  const isMine = match.home_id === currentUserId || match.away_id === currentUserId;
  const scoreExists = match.home_score !== null && match.away_score !== null;
  const statusColor = STATUS_COLORS[match.status];

  return (
    <Animated.View entering={FadeInDown.duration(240)}>
    <Pressable
      accessibilityRole="button"
      disabled={!enabled}
      onPress={() => router.push({ pathname: '/match/[id]', params: { id: match.id } })}
      style={({ pressed }) => [
        styles.matchCard,
        { borderLeftColor: statusColor.accent },
        isMine && styles.myMatch,
        !enabled && styles.lockedMatch,
        pressed && enabled && styles.pressed,
      ]}>
      <View style={styles.matchTop}>
        <Text style={styles.matchNumber}>Partido</Text>
        <View style={[styles.status, { backgroundColor: statusColor.background }]}>
          <Text style={[styles.statusText, { color: statusColor.text }]}>{STATUS_LABELS[match.status]}</Text>
        </View>
      </View>
      <View style={styles.teams}>
        <View style={styles.team}>
          <View style={styles.teamIdentity}>
            {clubsByUserId.get(match.home_id) ? (
              <Text numberOfLines={1} style={styles.clubName}>{clubsByUserId.get(match.home_id)}</Text>
            ) : null}
            <Text numberOfLines={1} style={styles.username}>{match.home?.username ?? 'Local'}</Text>
          </View>
          <Text style={styles.score}>{scoreExists ? match.home_score : '–'}</Text>
        </View>
        <Text style={styles.vs}>VS</Text>
        <View style={styles.team}>
          <View style={styles.teamIdentity}>
            {clubsByUserId.get(match.away_id) ? (
              <Text numberOfLines={1} style={styles.clubName}>{clubsByUserId.get(match.away_id)}</Text>
            ) : null}
            <Text numberOfLines={1} style={styles.username}>{match.away?.username ?? 'Visitante'}</Text>
          </View>
          <Text style={styles.score}>{scoreExists ? match.away_score : '–'}</Text>
        </View>
      </View>
      {!enabled ? <Text style={styles.lockedLabel}>Fecha aún no habilitada</Text> : null}
      {match.status === 'pendiente' && match.away_id === currentUserId ? (
        <View style={styles.respondBadge}>
          <Text style={styles.respondBadgeText}>Responder</Text>
        </View>
      ) : null}
    </Pressable>
    </Animated.View>
  );
}

export default function PartidosScreen() {
  const userId = useAuthStore((state) => state.profile?.id);
  const { tournament, loading: tournamentLoading, refresh: refreshTournament } = useTournament();
  const currentRound = tournament?.tournament?.current_round ?? 0;
  const [round, setRound] = useState<number | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const { matches, maximumRound, loading, refreshing, error, refresh } = useMatches({ round, mineOnly });
  const { standings } = useStandings();

  useEffect(() => {
    if (round === null && maximumRound > 0 && !tournamentLoading) {
      setRound(Math.min(Math.max(currentRound, 1), maximumRound));
    }
  }, [currentRound, maximumRound, round, tournamentLoading]);

  const onRefresh = useCallback(() => {
    void Promise.all([refresh(), refreshTournament()]);
  }, [refresh, refreshTournament]);

  useEffect(() => subscribeToSocketReconnect(() => {
    void Promise.all([refresh(), refreshTournament()]);
  }), [refresh, refreshTournament]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const refreshMatches = () => {
      void refresh();
    };
    const refreshAll = () => {
      void Promise.all([refresh(), refreshTournament()]);
    };
    socket.on('match:updated', refreshMatches);
    socket.on('match:result_pending', refreshMatches);
    socket.on('match:resolved', refreshMatches);
    socket.on('match:disputed', refreshMatches);
    socket.on('tournament:updated', refreshAll);
    return () => {
      socket.off('match:updated', refreshMatches);
      socket.off('match:result_pending', refreshMatches);
      socket.off('match:resolved', refreshMatches);
      socket.off('match:disputed', refreshMatches);
      socket.off('tournament:updated', refreshAll);
    };
  }, [refresh, refreshTournament]);

  const clubsByUserId = new Map(standings.map((standing) => [standing.user_id, standing.club_name]));
  const rounds = Array.from({ length: maximumRound }, (_, index) => index + 1);
  const visibleMatches = matches.filter((match) => !mineOnly
    || match.home_id === userId
    || match.away_id === userId);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}>
      <Text style={styles.eyebrow}>TORNEO</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={styles.title}>Calendario</Text>
      <Text style={styles.subtitle}>Consulta las fechas y resultados</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rounds}>
        {rounds.map((item) => {
          const enabled = item <= currentRound;
          const selected = item === round;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ disabled: !enabled, selected }}
              disabled={!enabled}
              onPress={() => setRound(item)}
              style={[styles.roundButton, selected && styles.selectedRound, !enabled && styles.disabledRound]}>
              <View style={styles.roundContent}>
                <Text style={[styles.roundText, selected && styles.selectedRoundText, !enabled && styles.disabledRoundText]}>
                  Fecha {item}
                </Text>
                {!enabled ? <Ionicons name="lock-closed" size={12} color={colors.textSubtle} /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Mis partidos</Text>
        <Switch
          value={mineOnly}
          onValueChange={setMineOnly}
          trackColor={{ false: colors.borderStrong, true: colors.switchOn }}
          thumbColor={mineOnly ? colors.accent : colors.switchOffThumb}
        />
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.accent} size="large" style={styles.loader} /> : null}
      {!loading && round !== null ? <Text style={styles.dateHeading}>Fecha {round}</Text> : null}
      {!loading && rounds.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Aún no hay fechas disponibles</Text>
        </View>
      ) : null}
      {!loading && rounds.length > 0 && visibleMatches.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{mineOnly ? 'No tienes partidos en esta fecha' : 'No hay partidos para esta fecha'}</Text>
        </View>
      ) : null}
      {!loading ? visibleMatches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          currentUserId={userId}
          enabled={match.round <= currentRound}
          clubsByUserId={clubsByUserId}
        />
      )) : null}
      {!loading && maximumRound > 0 && currentRound === 0 ? (
        <Text style={styles.lockedNotice}>Las fechas estarán disponibles cuando el torneo comience.</Text>
      ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, paddingBottom: 34 },
  eyebrow: { color: colors.accent, fontFamily: typography.bold, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 32, marginTop: spacing.sm },
  subtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 13, marginTop: 5 },
  dateHeading: { color: colors.text, fontFamily: typography.display, fontSize: 23, marginBottom: 3 },
  rounds: { gap: 9, paddingVertical: 20 },
  roundButton: { minHeight: 38, borderRadius: radii.pill, borderColor: colors.borderStrong, borderWidth: 1, backgroundColor: colors.surface, justifyContent: 'center', paddingHorizontal: 14 },
  selectedRound: { backgroundColor: colors.accent, borderColor: colors.accent },
  roundContent: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  disabledRound: { opacity: 0.5 },
  roundText: { color: colors.textMuted, fontFamily: typography.semibold, fontSize: 11 },
  selectedRoundText: { color: colors.accentInk },
  disabledRoundText: { color: colors.textSubtle },
  filterRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', borderBottomColor: colors.border, borderBottomWidth: 1, marginBottom: 12, paddingBottom: 10 },
  filterLabel: { color: colors.text, fontFamily: typography.semibold, fontSize: 13 },
  loader: { marginTop: 35 },
  error: { color: colors.danger, fontFamily: typography.medium, marginVertical: 14 },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, marginTop: 12, padding: 22 },
  emptyTitle: { color: colors.textMuted, fontFamily: typography.medium, fontSize: 13, textAlign: 'center' },
  matchCard: { backgroundColor: colors.surface, borderColor: colors.border, borderLeftWidth: 4, borderRadius: radii.md, borderWidth: 1, marginTop: 10, padding: 14 },
  myMatch: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised },
  lockedMatch: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
  matchTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  matchNumber: { color: colors.textSubtle, fontFamily: typography.medium, fontSize: 10, letterSpacing: 0.5 },
  status: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontFamily: typography.bold, fontSize: 9 },
  teams: { alignItems: 'center', flexDirection: 'row', marginTop: 15 },
  team: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8 },
  teamIdentity: { flex: 1 },
  clubName: { color: colors.text, fontFamily: typography.bold, fontSize: 11 },
  username: { color: colors.textMuted, fontFamily: typography.medium, fontSize: 10, marginTop: 2 },
  score: { color: colors.text, fontFamily: typography.display, fontSize: 27, minWidth: 22, textAlign: 'center', fontVariant: ['tabular-nums'] },
  vs: { color: colors.textSubtle, fontFamily: typography.bold, fontSize: 9, marginHorizontal: 8 },
  lockedLabel: { color: colors.pending, fontFamily: typography.medium, fontSize: 10, marginTop: 12 },
  respondBadge: { alignSelf: 'flex-start', backgroundColor: colors.pendingSurface, borderRadius: radii.pill, marginTop: 10, paddingHorizontal: 11, paddingVertical: 6 },
  respondBadgeText: { color: colors.pending, fontFamily: typography.bold, fontSize: 10 },
  lockedNotice: { color: colors.pending, fontFamily: typography.medium, fontSize: 11, lineHeight: 18, marginTop: 15, textAlign: 'center' },
});
