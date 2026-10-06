import { Image } from 'expo-image';
import * as Orientation from 'expo-screen-orientation';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { api } from '@/lib/api';
import {
  getSocket,
  subscribeToSocketInstance,
  subscribeToSocketReconnect,
  subscribeToSocketStatus,
} from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { useMatchRoomStore, type RoomEvent } from '@/store/matchRoom';
import type { Match, Player, StandingRow } from '@/types/tournament';
import { colors, matchStatusColors, radii, spacing, typography } from '@/theme';

type TeamView = {
  username: string;
  clubName: string;
  logoUrl: string | null;
};

function scoreInput(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const score = Number(value);
  return score <= 99 ? score : null;
}

function teamView(
  userId: string,
  match: Match,
  standings: StandingRow[],
  ownProfileId: string | undefined,
  ownClub: ReturnType<typeof useAuthStore.getState>['club'],
): TeamView {
  const participant = userId === match.home_id ? match.home : match.away;
  const standing = standings.find((row) => row.user_id === userId);
  const profileId = ownProfileId === userId;
  return {
    username: participant?.username ?? standing?.username ?? 'Jugador',
    clubName: profileId ? (ownClub?.name ?? standing?.club_name ?? 'Club') : (standing?.club_name ?? 'Club no disponible'),
    logoUrl: profileId ? (ownClub?.logo_url ?? standing?.logo_url ?? null) : (standing?.logo_url ?? null),
  };
}

function EventLabel({ event, match }: { event: RoomEvent; match: Match }) {
  const side = event.user_id === match.home_id ? 'Local' : 'Visitante';
  const label = event.type === 'gol' ? 'Gol' : event.type === 'amarilla' ? 'Tarjeta amarilla' : 'Tarjeta roja';
  const icon = event.type === 'gol' ? 'football' : event.type === 'amarilla' ? 'alert-circle' : 'close-circle';
  const iconColor = event.type === 'gol' ? colors.accent : event.type === 'amarilla' ? colors.pending : colors.disputed;
  return (
    <View style={styles.eventRow}>
      <Ionicons name={icon} size={18} color={iconColor} />
      <View style={styles.eventCopy}>
        <Text style={styles.eventTitle}>{label} · {side}</Text>
        <Text style={styles.eventMeta}>
          {event.minute === null ? 'Minuto no indicado' : `${event.minute}'`}
          {event.syncStatus === 'pending' ? ' · Pendiente de sincronizar' : ''}
        </Text>
      </View>
    </View>
  );
}

export default function MatchRoomScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const parsedMatchId = rawId === undefined ? NaN : Number(rawId);
  const matchId = Number.isFinite(parsedMatchId) && Number.isInteger(parsedMatchId) && parsedMatchId > 0
    ? parsedMatchId
    : NaN;
  const profile = useAuthStore((state) => state.profile);
  const club = useAuthStore((state) => state.club);
  const socket = useSyncExternalStore(subscribeToSocketInstance, getSocket, getSocket);
  const match = useMatchRoomStore((state) => state.match);
  const events = useMatchRoomStore((state) => state.events);
  const offlineQueue = useMatchRoomStore((state) => state.offlineQueue);
  const loading = useMatchRoomStore((state) => state.loading);
  const refreshing = useMatchRoomStore((state) => state.refreshing);
  const syncing = useMatchRoomStore((state) => state.syncing);
  const roomError = useMatchRoomStore((state) => state.error);
  const loadMatch = useMatchRoomStore((state) => state.loadMatch);
  const refreshEvents = useMatchRoomStore((state) => state.refreshEvents);
  const startMatch = useMatchRoomStore((state) => state.startMatch);
  const addEvent = useMatchRoomStore((state) => state.addEvent);
  const undoEvent = useMatchRoomStore((state) => state.undoEvent);
  const submitResult = useMatchRoomStore((state) => state.submitResult);
  const respondResult = useMatchRoomStore((state) => state.respondResult);
  const clearError = useMatchRoomStore((state) => state.clearError);

  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [homeInput, setHomeInput] = useState('');
  const [awayInput, setAwayInput] = useState('');
  const livePulse = useSharedValue(1);
  const livePulseStyle = useAnimatedStyle(() => ({ opacity: livePulse.value }));

  const reload = useCallback(() => {
    if (Number.isSafeInteger(matchId) && matchId > 0) void loadMatch(matchId);
  }, [loadMatch, matchId]);

  useFocusEffect(useCallback(() => {
    const lockLandscape = async () => {
      try {
        await Orientation.lockAsync(Orientation.OrientationLock.LANDSCAPE);
      } catch (error) {
        console.warn('No se pudo bloquear la orientación horizontal:', error);
      }
    };
    void lockLandscape();

    return () => {
      const restorePortrait = async () => {
        try {
          await Orientation.lockAsync(Orientation.OrientationLock.PORTRAIT_UP);
        } catch {
          try {
            await Orientation.unlockAsync();
          } catch (error) {
            console.warn('No se pudo restaurar la orientación vertical:', error);
          }
        }
      };
      void restorePortrait();
    };
  }, []));

  useEffect(() => {
    if (!Number.isSafeInteger(matchId) || matchId <= 0) return;
    void loadMatch(matchId);
    void api.get<StandingRow[]>('/tournament/standings')
      .then(setStandings)
      .catch((error: unknown) => {
        console.error('No se pudo cargar la información de clubes de la tabla:', error);
      });
  }, [loadMatch, matchId]);

  useEffect(() => subscribeToSocketStatus(setConnected), []);

  useEffect(() => {
    if (match?.status === 'en_juego') {
      livePulse.value = withRepeat(
        withSequence(
          withTiming(0.52, { duration: 750 }),
          withTiming(1, { duration: 750 }),
        ),
        -1,
        true,
      );
    } else {
      livePulse.value = 1;
    }
    return () => cancelAnimation(livePulse);
  }, [livePulse, match?.status]);

  useEffect(() => subscribeToSocketReconnect(() => {
    // Socket.io no recupera eventos perdidos; al reconectar se restablece el estado autoritativo por REST.
    reload();
    if (Number.isSafeInteger(matchId) && matchId > 0) void refreshEvents(matchId);
  }), [matchId, refreshEvents, reload]);

  useEffect(() => {
    if (!socket || !Number.isSafeInteger(matchId) || matchId <= 0) return undefined;

    // Cada instancia nueva recibe listeners propios y refetch para reconciliar cambios durante la renovación.
    reload();
    void refreshEvents(matchId);
    const handleMatch = (message: { match: Match }) => {
      if (message.match.id === matchId) reload();
    };
    const handleEvent = (message: { match: Match }) => {
      if (message.match.id === matchId) void refreshEvents(matchId);
    };
    socket.on('match:updated', handleMatch);
    socket.on('match:result_pending', handleMatch);
    socket.on('match:resolved', handleMatch);
    socket.on('match:disputed', handleMatch);
    socket.on('event:new', handleEvent);
    socket.on('event:deleted', handleEvent);
    return () => {
      socket.off('match:updated', handleMatch);
      socket.off('match:result_pending', handleMatch);
      socket.off('match:resolved', handleMatch);
      socket.off('match:disputed', handleMatch);
      socket.off('event:new', handleEvent);
      socket.off('event:deleted', handleEvent);
    };
  }, [matchId, refreshEvents, reload, socket]);

  useEffect(() => {
    if (!club?.id) return;
    void api.get<Player[]>(`/clubs/${encodeURIComponent(String(club.id))}/players`)
      .then(setPlayers)
      .catch((error: unknown) => {
        console.error('No se pudieron cargar los jugadores del club:', error);
      });
  }, [club?.id]);

  useEffect(() => {
    const isInProgress = match?.status === 'en_juego';
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isInProgress) return false;
      Alert.alert('Salir del partido', 'El partido sigue en juego. ¿Quieres salir de la sala?', [
        { text: 'Seguir jugando', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: () => router.back() },
      ]);
      return true;
    });
    return () => subscription.remove();
  }, [match?.status]);

  const pendingCount = offlineQueue.filter((entry) => entry.matchId === matchId && entry.userId === profile?.id).length;
  const isParticipant = Boolean(profile && match && (match.home_id === profile.id || match.away_id === profile.id));
  const isHome = Boolean(profile && match?.home_id === profile.id);
  const isAway = Boolean(profile && match?.away_id === profile.id);
  const ownEvents = useMemo(
    () => events.filter((event) => event.user_id === profile?.id),
    [events, profile?.id],
  );
  const homeGoals = match ? events.filter((event) => event.type === 'gol' && event.user_id === match.home_id).length : 0;
  const awayGoals = match ? events.filter((event) => event.type === 'gol' && event.user_id === match.away_id).length : 0;
  const homeTeam = match
    ? teamView(match.home_id, match, standings, profile?.id, club)
    : null;
  const awayTeam = match
    ? teamView(match.away_id, match, standings, profile?.id, club)
    : null;
  const homeDisplayScore = match?.status === 'pendiente' || match?.status === 'confirmado' || match?.status === 'disputa'
    ? (match.home_score ?? homeGoals)
    : homeGoals;
  const awayDisplayScore = match?.status === 'pendiente' || match?.status === 'confirmado' || match?.status === 'disputa'
    ? (match.away_score ?? awayGoals)
    : awayGoals;
  const canEdit = Boolean(profile?.id && isParticipant && match?.status === 'en_juego');
  const canRespond = isAway && match?.status === 'pendiente';
  const canFinish = isHome && match?.status === 'en_juego';
  // La interfaz limita las acciones al lado del usuario, pero RLS valida la autoría en cada escritura.
  const lastOwnEvent = ownEvents[ownEvents.length - 1];

  const goBack = () => {
    if (match?.status === 'en_juego') {
      Alert.alert('Salir del partido', 'El partido sigue en juego. ¿Quieres salir de la sala?', [
        { text: 'Seguir jugando', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  };

  const openResultDialog = () => {
    setHomeInput(String(homeGoals));
    setAwayInput(String(awayGoals));
    setResultModalVisible(true);
  };

  const handleFinish = async () => {
    const home = scoreInput(homeInput);
    const away = scoreInput(awayInput);
    if (home === null || away === null) {
      Alert.alert('Marcador inválido', 'Ingresa dos marcadores enteros entre 0 y 99.');
      return;
    }
    if (pendingCount > 0) {
      Alert.alert('Eventos pendientes', 'Espera a que se sincronicen todos los eventos antes de enviar el resultado.');
      return;
    }
    setSubmitting(true);
    try {
      const submitted = await submitResult(matchId, home, away);
      if (submitted) setResultModalVisible(false);
    } catch (error) {
      console.error('Error inesperado al finalizar el partido:', error);
      Alert.alert(
        'No se pudo enviar el resultado',
        error instanceof Error ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResponse = async (approve: boolean) => {
    setSubmitting(true);
    await respondResult(matchId, approve);
    setSubmitting(false);
  };

  const handleStart = async () => {
    setSubmitting(true);
    await startMatch(matchId);
    setSubmitting(false);
  };

  if (!Number.isSafeInteger(matchId) || matchId <= 0) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
        <Text style={styles.errorText}>El id del partido no es válido.</Text>
      </SafeAreaView>
    );
  }

  if (loading && !match) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingLabel}>Cargando partido…</Text>
      </SafeAreaView>
    );
  }

  if (!match) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
        <Pressable onPress={goBack} style={styles.backButton}><Text style={styles.backText}>‹ Atrás</Text></Pressable>
        <Text style={styles.errorText}>{roomError ?? 'No se encontró ese partido.'}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Atrás</Text>
        </Pressable>
        <View style={styles.topStatus}>
          <View style={[styles.connectionDot, connected ? styles.connectedDot : styles.disconnectedDot]} />
          <Text style={styles.connectionText}>{connected ? 'Conectado' : 'Reconectando'}</Text>
          {pendingCount > 0 ? <Text style={styles.pendingCounter}>{pendingCount} pendiente{pendingCount === 1 ? '' : 's'}</Text> : null}
          {syncing ? <ActivityIndicator color={colors.accent} size="small" /> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} horizontal={false}>
        <View style={styles.headerLine}>
          <Text style={styles.eyebrow}>FECHA {match.round} · PARTIDO {match.id}</Text>
          <Pressable onPress={reload} style={styles.refreshButton}>
            <Text style={styles.refreshText}>{refreshing ? 'Actualizando…' : 'Actualizar'}</Text>
          </Pressable>
        </View>

        <View style={styles.scoreBoard}>
          {homeTeam ? (
            <View style={styles.teamPanel}>
              {homeTeam.logoUrl
                ? <Image contentFit="contain" source={{ uri: homeTeam.logoUrl }} style={styles.teamLogo} />
                : <View style={styles.logoFallback}><Text style={styles.logoFallbackText}>{homeTeam.clubName.slice(0, 1)}</Text></View>}
              <Text numberOfLines={1} style={styles.clubName}>{homeTeam.clubName}</Text>
              <Text numberOfLines={1} style={styles.username}>{homeTeam.username} · Local</Text>
            </View>
          ) : null}
          <View style={styles.scoreCenter}>
            <Text style={styles.score}>{homeDisplayScore}<Text style={styles.scoreSeparator}> : </Text>{awayDisplayScore}</Text>
            {match.status === 'en_juego' ? (
              <Reanimated.Text style={[styles.status, styles.liveStatus, livePulseStyle]}>EN VIVO</Reanimated.Text>
            ) : (
              <Text style={[styles.status, { color: matchStatusColors[match.status].text }]}>
                {match.status.replace('_', ' ').toUpperCase()}
              </Text>
            )}
          </View>
          {awayTeam ? (
            <View style={styles.teamPanel}>
              {awayTeam.logoUrl
                ? <Image contentFit="contain" source={{ uri: awayTeam.logoUrl }} style={styles.teamLogo} />
                : <View style={styles.logoFallback}><Text style={styles.logoFallbackText}>{awayTeam.clubName.slice(0, 1)}</Text></View>}
              <Text numberOfLines={1} style={styles.clubName}>{awayTeam.clubName}</Text>
              <Text numberOfLines={1} style={styles.username}>{awayTeam.username} · Visitante</Text>
            </View>
          ) : null}
        </View>

        {roomError ? (
          <Pressable onPress={clearError}>
            <Text accessibilityRole="alert" style={styles.errorBanner}>{roomError}</Text>
          </Pressable>
        ) : null}
        {!isParticipant ? <Text style={styles.notice}>No participas en este partido; puedes consultar su estado y sus eventos.</Text> : null}

        {isParticipant && match.status === 'programado' ? (
          <Pressable disabled={submitting} onPress={() => void handleStart()} style={[styles.primaryButton, submitting && styles.disabled]}>
            {submitting ? <ActivityIndicator color={colors.accentInk} /> : <Text style={styles.primaryText}>Iniciar partido</Text>}
          </Pressable>
        ) : null}

        {canEdit ? (
          <View style={styles.controls}>
            <Text style={styles.sectionTitle}>Acciones de tu equipo</Text>
            <Text style={styles.ownershipNote}>Registra los eventos de tu equipo.</Text>
            <ScrollView horizontal contentContainerStyle={styles.playerPicker} showsHorizontalScrollIndicator={false}>
              {players.map((player) => (
                <Pressable
                  key={player.id}
                  onPress={() => setSelectedPlayerId(player.id)}
                  style={[styles.playerChip, selectedPlayerId === player.id && styles.selectedChip]}>
                  <Text numberOfLines={1} style={[styles.playerChipText, selectedPlayerId === player.id && styles.selectedChipText]}>
                    {player.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {!selectedPlayerId ? (
              <Text style={styles.playerRequired}>Selecciona un jugador de tu club. La política de la base exige player_id para registrar el evento.</Text>
            ) : null}
            <View style={styles.actionRow}>
              <Pressable disabled={!profile?.id || !selectedPlayerId || submitting} onPress={() => void addEvent(matchId, 'gol', selectedPlayerId)} style={[styles.actionButton, styles.goalButton, (!profile?.id || !selectedPlayerId || submitting) && styles.disabled]}>
                <Text style={styles.actionText}>⚽ GOL</Text>
              </Pressable>
              <Pressable disabled={!profile?.id || !selectedPlayerId || submitting} onPress={() => void addEvent(matchId, 'amarilla', selectedPlayerId)} style={[styles.actionButton, styles.yellowButton, (!profile?.id || !selectedPlayerId || submitting) && styles.disabled]}>
                <Text style={styles.actionText}>AMARILLA</Text>
              </Pressable>
              <Pressable disabled={!profile?.id || !selectedPlayerId || submitting} onPress={() => void addEvent(matchId, 'roja', selectedPlayerId)} style={[styles.actionButton, styles.redButton, (!profile?.id || !selectedPlayerId || submitting) && styles.disabled]}>
                <Text style={styles.actionText}>ROJA</Text>
              </Pressable>
              <Pressable
                disabled={!lastOwnEvent}
                onPress={() => lastOwnEvent && void undoEvent(lastOwnEvent)}
                style={[styles.actionButton, styles.undoButton, !lastOwnEvent && styles.disabled]}>
                <Text style={styles.actionText}>DESHACER</Text>
              </Pressable>
            </View>
            {canFinish ? (
              <Pressable
                disabled={submitting || pendingCount > 0}
                onPress={openResultDialog}
                style={[styles.finishButton, (submitting || pendingCount > 0) && styles.disabled]}>
                <Text style={styles.finishText}>{pendingCount > 0 ? 'Sincronizando eventos…' : 'Finalizar partido'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {isHome && match.status === 'pendiente' ? (
          <View style={styles.noticeCard}><Text style={styles.notice}>Esperando confirmación del rival</Text></View>
        ) : null}
        {match.status === 'confirmado' ? (
          <View style={styles.noticeCard}>
            <Text style={styles.sectionTitle}>Resultado confirmado</Text>
            <Text style={styles.finalScore}>{match.home_score ?? homeGoals} : {match.away_score ?? awayGoals}</Text>
            <Pressable onPress={goBack} style={styles.primaryButton}><Text style={styles.primaryText}>Volver a Partidos</Text></Pressable>
          </View>
        ) : null}
        {match.status === 'disputa' ? (
          <View style={styles.disputeCard}>
            <Text style={styles.disputeText}>El marcador está en disputa; el administrador decidirá</Text>
          </View>
        ) : null}

        <View style={styles.timeline}>
          <Text style={styles.sectionTitle}>Línea de tiempo</Text>
          {events.length === 0 ? <Text style={styles.emptyText}>Aún no hay eventos registrados.</Text> : null}
          {events.map((event) => <EventLabel key={event.client_id} event={event} match={match} />)}
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']}
        onRequestClose={() => {
          if (!canRespond) setResultModalVisible(false);
        }}
        transparent
        visible={resultModalVisible || Boolean(canRespond)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {canRespond ? (
              <>
                <Text style={styles.modalTitle}>Confirmar resultado</Text>
                <Text style={styles.modalBody}>
                  El local reportó {match.home_score ?? homeGoals} : {match.away_score ?? awayGoals}. ¿Apruebas el marcador?
                </Text>
                {roomError ? <Text style={styles.modalError}>{roomError}</Text> : null}
                <View style={styles.modalActions}>
                  <Pressable disabled={submitting} onPress={() => void handleResponse(false)} style={[styles.modalButton, styles.rejectButton]}>
                    <Text style={styles.modalButtonText}>Rechazar</Text>
                  </Pressable>
                  <Pressable disabled={submitting} onPress={() => void handleResponse(true)} style={[styles.modalButton, styles.approveButton]}>
                    <Text style={styles.modalButtonText}>Aprobar</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Enviar resultado final</Text>
                <Text style={styles.modalBody}>Revisa o ajusta el marcador antes de enviarlo al visitante.</Text>
                {roomError ? <Text style={styles.modalError}>{roomError}</Text> : null}
                <View style={styles.scoreInputs}>
                  <TextInput keyboardType="number-pad" maxLength={2} onChangeText={setHomeInput} style={styles.scoreInput} value={homeInput} />
                  <Text style={styles.scoreInputSeparator}>:</Text>
                  <TextInput keyboardType="number-pad" maxLength={2} onChangeText={setAwayInput} style={styles.scoreInput} value={awayInput} />
                </View>
                <View style={styles.modalActions}>
                  <Pressable onPress={() => setResultModalVisible(false)} style={[styles.modalButton, styles.rejectButton]}>
                    <Text style={styles.modalButtonText}>Cancelar</Text>
                  </Pressable>
                  <Pressable disabled={submitting} onPress={() => void handleFinish()} style={[styles.modalButton, styles.approveButton]}>
                    {submitting ? <ActivityIndicator color={colors.accentInk} /> : <Text style={styles.modalButtonText}>Enviar</Text>}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: 24 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: 7 },
  backButton: { paddingHorizontal: 10, paddingVertical: 7 },
  backText: { color: colors.text, fontFamily: typography.semibold, fontSize: 13 },
  topStatus: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  connectionDot: { borderRadius: 5, height: 9, width: 9 },
  connectedDot: { backgroundColor: colors.accent },
  disconnectedDot: { backgroundColor: colors.pending },
  connectionText: { color: colors.textMuted, fontFamily: typography.medium, fontSize: 10 },
  pendingCounter: { color: colors.pending, fontFamily: typography.bold, fontSize: 10 },
  loadingLabel: { color: colors.textMuted, fontFamily: typography.body, marginTop: 12 },
  headerLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, marginTop: 2 },
  eyebrow: { color: colors.textSubtle, fontFamily: typography.bold, fontSize: 9, letterSpacing: 1.4 },
  refreshButton: { padding: 6 },
  refreshText: { color: colors.accent, fontFamily: typography.semibold, fontSize: 10 },
  scoreBoard: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 158, paddingHorizontal: 18, paddingVertical: 13 },
  teamPanel: { alignItems: 'center', flex: 1, minWidth: 0 },
  teamLogo: { height: 54, marginBottom: 5, width: 54 },
  logoFallback: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 26, height: 52, justifyContent: 'center', marginBottom: 6, width: 52 },
  logoFallbackText: { color: colors.accent, fontFamily: typography.display, fontSize: 28 },
  clubName: { color: colors.text, fontFamily: typography.bold, fontSize: 12, maxWidth: '100%' },
  username: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 3, maxWidth: '100%' },
  scoreCenter: { alignItems: 'center', minWidth: 170, paddingHorizontal: 10 },
  score: { color: colors.text, fontFamily: typography.display, fontSize: 56, fontVariant: ['tabular-nums'] },
  scoreSeparator: { color: colors.textSubtle },
  status: { color: colors.scheduled, fontFamily: typography.bold, fontSize: 10, letterSpacing: 1.5, marginTop: 2 },
  liveStatus: { color: colors.live },
  errorText: { color: colors.danger, fontFamily: typography.medium, fontSize: 14, textAlign: 'center' },
  errorBanner: { backgroundColor: colors.dangerSurface, borderRadius: radii.sm, color: colors.dangerText, fontFamily: typography.medium, fontSize: 11, marginTop: 9, padding: 9 },
  notice: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, lineHeight: 18, textAlign: 'center' },
  controls: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, marginTop: 11, padding: 12 },
  sectionTitle: { color: colors.text, fontFamily: typography.bold, fontSize: 13 },
  ownershipNote: { color: colors.textSubtle, fontFamily: typography.body, fontSize: 9, lineHeight: 14, marginTop: 4 },
  playerRequired: { color: colors.pending, fontFamily: typography.medium, fontSize: 9, marginBottom: 8 },
  playerPicker: { alignItems: 'center', gap: 7, paddingVertical: 10 },
  playerChip: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong, borderRadius: radii.pill, borderWidth: 1, maxWidth: 150, paddingHorizontal: 11, paddingVertical: 7 },
  selectedChip: { backgroundColor: colors.accent, borderColor: colors.accent },
  playerChipText: { color: colors.text, fontFamily: typography.medium, fontSize: 9 },
  selectedChipText: { color: colors.accentInk },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionButton: { alignItems: 'center', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: 7 },
  goalButton: { backgroundColor: colors.goalAction },
  yellowButton: { backgroundColor: colors.yellowAction },
  redButton: { backgroundColor: colors.redAction },
  undoButton: { backgroundColor: colors.surfaceMuted },
  actionText: { color: colors.text, fontFamily: typography.bold, fontSize: 10 },
  finishButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.sm, justifyContent: 'center', marginTop: 9, minHeight: 43 },
  finishText: { color: colors.accentInk, fontFamily: typography.bold, fontSize: 12 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.sm, justifyContent: 'center', marginTop: 8, minHeight: 42, paddingHorizontal: 16 },
  primaryText: { color: colors.accentInk, fontFamily: typography.bold, fontSize: 12 },
  disabled: { opacity: 0.5 },
  noticeCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.sm, gap: 8, marginTop: 10, padding: 13 },
  finalScore: { color: colors.accent, fontFamily: typography.display, fontSize: 38, fontVariant: ['tabular-nums'] },
  disputeCard: { backgroundColor: colors.dangerSurface, borderRadius: radii.sm, marginTop: 10, padding: 13 },
  disputeText: { color: colors.dangerText, fontFamily: typography.semibold, fontSize: 12, textAlign: 'center' },
  timeline: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, marginTop: 11, padding: 12 },
  emptyText: { color: colors.textSubtle, fontFamily: typography.body, fontSize: 10, marginTop: 10 },
  eventRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 8 },
  eventCopy: { flex: 1 },
  eventTitle: { color: colors.text, fontFamily: typography.semibold, fontSize: 10 },
  eventMeta: { color: colors.textSubtle, fontFamily: typography.body, fontSize: 9, marginTop: 2 },
  modalBackdrop: { alignItems: 'center', backgroundColor: colors.modalOverlay, flex: 1, justifyContent: 'center', padding: 22 },
  modalCard: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: radii.lg, borderWidth: 1, maxWidth: 480, padding: 20, width: '100%' },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 26, textAlign: 'center' },
  modalBody: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, lineHeight: 19, marginTop: 9, textAlign: 'center' },
  modalError: { color: colors.danger, fontFamily: typography.medium, fontSize: 10, lineHeight: 16, marginTop: 8, textAlign: 'center' },
  scoreInputs: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 15 },
  scoreInput: { backgroundColor: colors.background, borderColor: colors.borderStrong, borderRadius: radii.sm, borderWidth: 1, color: colors.text, fontFamily: typography.display, fontSize: 26, minWidth: 65, padding: 9, textAlign: 'center', fontVariant: ['tabular-nums'] },
  scoreInputSeparator: { color: colors.accent, fontFamily: typography.display, fontSize: 24 },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 17 },
  modalButton: { alignItems: 'center', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 44 },
  rejectButton: { backgroundColor: colors.surfaceMuted },
  approveButton: { backgroundColor: colors.accent },
  modalButtonText: { color: colors.accentInk, fontFamily: typography.bold, fontSize: 12 },
});
