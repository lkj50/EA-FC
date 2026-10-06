import { Redirect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useMatches } from '@/hooks/useMatches';
import { useStandings } from '@/hooks/useStandings';
import { useTournament } from '@/hooks/useTournament';
import type { AdminActionResponse, Match, ResolveDisputeRequest } from '@/types/tournament';
import { colors, radii, spacing, typography } from '@/theme';

type ScoreInput = {
  home: string;
  away: string;
};

function dateLabel(value: string | undefined): string {
  if (!value) return 'Fecha no disponible';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : date.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

function readScore(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const score = Number(value);
  return Number.isSafeInteger(score) && score >= 0 ? score : null;
}

function formatStatus(status: string | undefined): string {
  if (!status) return 'No disponible';
  return status.replaceAll('_', ' ').replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('es'));
}

export default function AdminScreen() {
  const role = useAuthStore((state) => state.profile?.role);
  if (role !== 'admin') return <Redirect href="/(app)" />;
  return <AdminPanel />;
}

function AdminPanel() {
  const { tournament, loading: tournamentLoading, refreshing: tournamentRefreshing, error: tournamentError, refresh: refreshTournament } = useTournament();
  const { matches, disputes, maximumRound, loading: matchesLoading, refreshing: matchesRefreshing, error: matchesError, refresh: refreshMatches } = useMatches({ includeDisputes: true });
  const { standings, refresh: refreshStandings } = useStandings();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [scores, setScores] = useState<Record<string, ScoreInput>>({});

  const status = tournament?.tournament?.status;
  const currentRound = tournament?.tournament?.current_round ?? 0;
  const canStart = status === 'registro';
  const canAdvance = status === 'en_curso' && currentRound < maximumRound;
  const matchesById = useMemo(() => new Map(matches.map((match) => [match.id, match])), [matches]);
  const clubsByUserId = useMemo(
    () => new Map(standings.map((standing) => [standing.user_id, standing.club_name])),
    [standings],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshTournament(), refreshMatches(), refreshStandings()]);
  }, [refreshMatches, refreshStandings, refreshTournament]);

  const performAction = async (action: 'start' | 'advance') => {
    setBusy(action);
    setMessage('');
    try {
      const path = action === 'start' ? '/admin/tournament/start' : '/admin/tournament/advance';
      await api.post<AdminActionResponse>(path, {});
      await refreshAll();
      setMessage(action === 'start' ? 'Torneo iniciado correctamente.' : 'Siguiente fecha habilitada correctamente.');
      setMessageIsError(false);
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : 'No se pudo completar la acción.');
      setMessageIsError(true);
    } finally {
      setBusy('');
    }
  };

  const confirmStart = () => {
    Alert.alert(
      'Iniciar torneo',
      'Al iniciar el torneo ya no se admitirán más participantes. ¿Quieres continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Iniciar torneo', style: 'destructive', onPress: () => void performAction('start') },
      ],
    );
  };

  const resolveMatch = async (match: Match) => {
    const score = scores[match.id] ?? { home: '', away: '' };
    const home = readScore(score.home);
    const away = readScore(score.away);
    if (home === null || away === null) {
      setMessage('Ingresa ambos marcadores como enteros mayores o iguales a cero.');
      setMessageIsError(true);
      return;
    }

    setBusy(String(match.id));
    setMessage('');
    try {
      const payload: ResolveDisputeRequest = { home, away };
      await api.post<AdminActionResponse>(`/admin/matches/${match.id}/resolve`, payload);
      await refreshAll();
      setScores((current) => {
        const next = { ...current };
        delete next[match.id];
        return next;
      });
      setMessage(`Disputa de la Fecha ${match.round} resuelta correctamente.`);
      setMessageIsError(false);
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : 'No se pudo resolver la disputa.');
      setMessageIsError(true);
    } finally {
      setBusy('');
    }
  };

  const onRefresh = useCallback(() => {
    void refreshAll();
  }, [refreshAll]);

  const isLoading = tournamentLoading || matchesLoading;
  const isRefreshing = tournamentRefreshing || matchesRefreshing;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}>
      <Text style={styles.eyebrow}>GESTIÓN DEL TORNEO</Text>
      <Text style={styles.title}>Administración</Text>

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Estado</Text>
        <Text style={styles.summaryValue}>{formatStatus(status)}</Text>
        <Text style={styles.summaryLabel}>Fecha actual habilitada</Text>
        <Text style={styles.summaryValue}>{currentRound > 0 ? `Fecha ${currentRound}` : 'Ninguna'}</Text>
        <Text style={styles.summaryLabel}>Fecha y hora del servidor</Text>
        <Text style={styles.summaryValue}>{dateLabel(tournament?.current_date)}</Text>
      </View>

      {isLoading ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}
      {tournamentError ? <Text accessibilityRole="alert" style={styles.error}>{tournamentError}</Text> : null}
      {matchesError ? <Text accessibilityRole="alert" style={styles.error}>{matchesError}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={!canStart || busy !== ''}
        onPress={confirmStart}
        style={({ pressed }) => [styles.primaryButton, (!canStart || busy !== '') && styles.disabled, pressed && canStart && styles.pressed]}>
        {busy === 'start'
          ? <ActivityIndicator color={colors.accentInk} />
          : <Text style={styles.primaryText}>Iniciar torneo</Text>}
      </Pressable>
      {!canStart ? <Text style={styles.hint}>Disponible únicamente durante el registro.</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={!canAdvance || busy !== ''}
        onPress={() => void performAction('advance')}
        style={({ pressed }) => [styles.secondaryButton, (!canAdvance || busy !== '') && styles.disabled, pressed && canAdvance && styles.pressed]}>
        {busy === 'advance'
          ? <ActivityIndicator color={colors.text} />
          : <Text style={styles.secondaryText}>Habilitar siguiente fecha</Text>}
      </Pressable>
      <Text style={styles.hint}>
        {maximumRound > 0 && canAdvance
          ? `Quedan ${maximumRound - currentRound} fecha(s) por habilitar.`
          : 'No hay fechas pendientes para habilitar.'}
      </Text>

      {message ? (
        <Text accessibilityRole="alert" style={messageIsError ? styles.error : styles.success}>{message}</Text>
      ) : null}

      <Text style={styles.sectionTitle}>Partidos en disputa</Text>
      {disputes.length === 0 && !isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No hay partidos en disputa.</Text>
        </View>
      ) : null}

      {disputes.map((dispute) => {
        const enriched = matchesById.get(dispute.id);
        const local = enriched?.home?.username ?? 'Local';
        const visitor = enriched?.away?.username ?? 'Visitante';
        const homeClub = clubsByUserId.get(dispute.home_id);
        const awayClub = clubsByUserId.get(dispute.away_id);
        const score = scores[dispute.id] ?? { home: '', away: '' };
        return (
          <Animated.View key={dispute.id} entering={FadeInDown.duration(240)} style={styles.disputeCard}>
            <View style={styles.disputeHeading}>
              <Text style={styles.disputeRound}>Fecha {dispute.round}</Text>
              <Text style={styles.disputeStatus}>Disputa</Text>
            </View>
            <Text style={styles.teamsText}>
              {homeClub ? `${homeClub} · ` : ''}{local}{'  vs  '}{awayClub ? `${awayClub} · ` : ''}{visitor}
            </Text>
            <View style={styles.scoreInputs}>
              <TextInput
                accessibilityLabel={`Marcador local, partido ${dispute.id}`}
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={(value) => setScores((current) => ({ ...current, [dispute.id]: { ...score, home: value } }))}
                placeholder="Local"
                placeholderTextColor={colors.placeholder}
                style={styles.scoreInput}
                value={score.home}
              />
              <Text style={styles.scoreSeparator}>–</Text>
              <TextInput
                accessibilityLabel={`Marcador visitante, partido ${dispute.id}`}
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={(value) => setScores((current) => ({ ...current, [dispute.id]: { ...score, away: value } }))}
                placeholder="Visita"
                placeholderTextColor={colors.placeholder}
                style={styles.scoreInput}
                value={score.away}
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy !== ''}
                onPress={() => void resolveMatch(dispute)}
                style={({ pressed }) => [styles.resolveButton, (busy !== '') && styles.disabled, pressed && styles.pressed]}>
                {busy === String(dispute.id)
                  ? <ActivityIndicator color={colors.accentInk} size="small" />
                  : <Text style={styles.resolveText}>Resolver</Text>}
              </Pressable>
            </View>
          </Animated.View>
        );
      })}

      <Text style={styles.securityNote}>
        La pestaña se oculta a los jugadores para simplificar la interfaz; los permisos reales siempre se verifican en el backend y en RLS.
      </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, paddingBottom: 36 },
  eyebrow: { color: colors.accent, fontFamily: typography.bold, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 34, marginTop: 8, marginBottom: 20 },
  summary: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, padding: 16 },
  summaryLabel: { color: colors.textSubtle, fontFamily: typography.medium, fontSize: 10, marginTop: 9 },
  summaryValue: { color: colors.text, fontFamily: typography.bold, fontSize: 14, marginTop: 3 },
  loader: { marginVertical: 18 },
  error: { color: colors.danger, fontFamily: typography.medium, lineHeight: 19, marginTop: 12 },
  success: { color: colors.successText, fontFamily: typography.medium, lineHeight: 19, marginTop: 12 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.sm, justifyContent: 'center', marginTop: 20, minHeight: 50 },
  primaryText: { color: colors.accentInk, fontFamily: typography.bold, fontSize: 13 },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong, borderRadius: radii.sm, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 50 },
  secondaryText: { color: colors.text, fontFamily: typography.bold, fontSize: 13 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  hint: { color: colors.textSubtle, fontFamily: typography.body, fontSize: 10, marginTop: 7 },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 23, marginTop: 30, marginBottom: 10 },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, padding: 20 },
  emptyText: { color: colors.textMuted, fontFamily: typography.body },
  disputeCard: { backgroundColor: colors.surface, borderColor: colors.dangerBorder, borderLeftColor: colors.disputed, borderLeftWidth: 4, borderRadius: radii.md, borderWidth: 1, marginTop: 10, padding: 14 },
  disputeHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  disputeRound: { color: colors.text, fontFamily: typography.bold, fontSize: 13 },
  disputeStatus: { color: colors.disputed, fontFamily: typography.bold, fontSize: 10 },
  teamsText: { color: colors.textMuted, fontFamily: typography.medium, fontSize: 11, lineHeight: 18, marginTop: 12 },
  scoreInputs: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 14 },
  scoreInput: { width: 64, height: 44, borderColor: colors.borderStrong, borderRadius: radii.sm, borderWidth: 1, backgroundColor: colors.background, color: colors.text, textAlign: 'center', fontSize: 16, fontFamily: typography.bold, fontVariant: ['tabular-nums'] },
  scoreSeparator: { color: colors.textMuted, fontFamily: typography.display, fontSize: 20 },
  resolveButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.sm, flex: 1, justifyContent: 'center', minHeight: 44 },
  resolveText: { color: colors.accentInk, fontFamily: typography.bold, fontSize: 11 },
  securityNote: { color: colors.textSubtle, fontFamily: typography.body, fontSize: 10, lineHeight: 17, marginTop: 30 },
});
