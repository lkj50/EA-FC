import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, Circle, Line, Rect } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as ScreenOrientation from 'expo-screen-orientation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLineupStore } from '@/store/lineup';
import { colors, radii, spacing, typography } from '@/theme';
import {
  FORMATIONS,
  PLAYER_POSITION_GROUPS,
  isFormationName,
  type ClubPlayer,
  type FormationName,
  type FormationSlot,
  type LineupResponse,
  type NormalizedPosition,
} from '@/types/lineup';

const FIELD_RATIO = 68 / 105;
const TOKEN_SIZE = 48;
const TOKEN_RADIUS = TOKEN_SIZE / 2;

type AssignedPlayer = {
  player: ClubPlayer;
  slot: FormationSlot;
};

type BoardSize = {
  width: number;
  height: number;
};

function isClubPlayerList(value: unknown): value is ClubPlayer[] {
  return Array.isArray(value) && value.every((item) =>
    typeof item === 'object'
    && item !== null
    && 'id' in item
    && typeof item.id === 'number'
    && Number.isSafeInteger(item.id)
    && item.id > 0
    && 'name' in item
    && typeof item.name === 'string'
    && 'position' in item
    && typeof item.position === 'string'
    && 'overall' in item
    && (typeof item.overall === 'number' || item.overall === null),
  );
}

function sanitizePositions(value: unknown): Record<string, NormalizedPosition> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: Record<string, NormalizedPosition> = {};
  for (const [playerId, candidate] of Object.entries(value)) {
    if (!/^\d+$/.test(playerId) || !Number.isSafeInteger(Number(playerId))) continue;
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) continue;
    if (!('x' in candidate) || !('y' in candidate)
      || typeof candidate.x !== 'number' || !Number.isFinite(candidate.x)
      || typeof candidate.y !== 'number' || !Number.isFinite(candidate.y)) continue;

    // Normaliza filas antiguas guardadas como porcentaje (0–100).
    const scale = candidate.x > 1 || candidate.y > 1 ? 100 : 1;
    const x = candidate.x / scale;
    const y = candidate.y / scale;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;
    result[playerId] = { x, y };
  }
  return result;
}

function sortByOverall(players: ClubPlayer[]): ClubPlayer[] {
  return [...players].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
}

function choosePlayers(players: ClubPlayer[], slots: readonly FormationSlot[]): AssignedPlayer[] {
  const ordered = sortByOverall(players);
  const selected = new Set<number>();
  const assignments: AssignedPlayer[] = [];

  for (const slot of slots) {
    const bestInRole = ordered.find((player) =>
      !selected.has(player.id) && PLAYER_POSITION_GROUPS[player.position] === slot.role,
    );
    const fallback = ordered.find((player) =>
      !selected.has(player.id)
      && (PLAYER_POSITION_GROUPS[player.position] !== 'POR'
        || !ordered.some((candidate) => !selected.has(candidate.id) && PLAYER_POSITION_GROUPS[candidate.position] !== 'POR')),
    );
    const player = slot.role === 'POR' ? bestInRole ?? fallback : bestInRole ?? fallback;
    if (!player) continue;
    selected.add(player.id);
    assignments.push({ player, slot });
  }
  return assignments;
}

function shortSurname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1]?.slice(0, 10) ?? name.slice(0, 10);
}

function commitPosition(playerId: number, x: number, y: number): void {
  useLineupStore.getState().setPosition(playerId, { x, y });
}

function TacticalToken({
  player,
  position,
  board,
}: {
  player: ClubPlayer;
  position: NormalizedPosition;
  board: BoardSize;
}) {
  const x = useSharedValue(position.x * board.width);
  const y = useSharedValue(position.y * board.height);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragging = useSharedValue(false);

  useEffect(() => {
    const targetX = Math.max(TOKEN_RADIUS, Math.min(board.width - TOKEN_RADIUS, position.x * board.width));
    const targetY = Math.max(TOKEN_RADIUS, Math.min(board.height - TOKEN_RADIUS, position.y * board.height));
    x.value = withTiming(targetX, { duration: 300 });
    y.value = withTiming(targetY, { duration: 300 });
  }, [board.height, board.width, position.x, position.y, x, y]);

  const gesture = useMemo(() => Gesture.Pan()
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
      dragging.value = true;
    })
    .onUpdate((event) => {
      x.value = Math.max(TOKEN_RADIUS, Math.min(board.width - TOKEN_RADIUS, startX.value + event.translationX));
      y.value = Math.max(TOKEN_RADIUS, Math.min(board.height - TOKEN_RADIUS, startY.value + event.translationY));
    })
    .onEnd(() => {
      dragging.value = false;
      runOnJS(commitPosition)(
        player.id,
        Math.max(0, Math.min(1, x.value / board.width)),
        Math.max(0, Math.min(1, y.value / board.height)),
      );
    }), [board.height, board.width, dragging, player.id, startX, startY, x, y]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value - TOKEN_RADIUS },
      { translateY: y.value - TOKEN_RADIUS },
    ],
    zIndex: dragging.value ? 20 : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.token, animatedStyle]}>
        <Text numberOfLines={1} style={styles.tokenName}>{shortSurname(player.name)}</Text>
        <Text style={styles.tokenOverall}>{player.overall ?? '—'}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

function TacticalField({ width, height }: BoardSize) {
  const margin = Math.min(width, height) * 0.035;
  const centerX = width / 2;
  const centerY = height / 2;
  const boxWidth = width * 0.56;
  const boxDepth = height * 0.13;
  const smallBoxWidth = width * 0.28;
  const smallBoxDepth = height * 0.055;
  const stroke = Math.max(1.5, width * 0.004);

  return (
    <Canvas style={{ width, height }}>
      <Rect x={0} y={0} width={width} height={height} color={colors.pitch} />
      {Array.from({ length: 10 }, (_, index) => (
        <Rect
          key={index}
          x={0}
          y={(height / 10) * index}
          width={width}
          height={height / 10}
          color={index % 2 === 0 ? colors.pitch : colors.pitchAlternate}
        />
      ))}
      <Rect
        x={margin}
        y={margin}
        width={width - margin * 2}
        height={height - margin * 2}
        color={colors.pitchLine}
        style="stroke"
        strokeWidth={stroke}
      />
      <Line p1={{ x: margin, y: centerY }} p2={{ x: width - margin, y: centerY }} color={colors.pitchLine} strokeWidth={stroke} />
      <Circle cx={centerX} cy={centerY} r={width * 0.14} color={colors.pitchLine} style="stroke" strokeWidth={stroke} />
      <Circle cx={centerX} cy={centerY} r={stroke * 1.8} color={colors.pitchLine} />
      <Rect
        x={centerX - boxWidth / 2}
        y={margin}
        width={boxWidth}
        height={boxDepth}
        color={colors.pitchLine}
        style="stroke"
        strokeWidth={stroke}
      />
      <Rect
        x={centerX - boxWidth / 2}
        y={height - margin - boxDepth}
        width={boxWidth}
        height={boxDepth}
        color={colors.pitchLine}
        style="stroke"
        strokeWidth={stroke}
      />
      <Rect
        x={centerX - smallBoxWidth / 2}
        y={margin}
        width={smallBoxWidth}
        height={smallBoxDepth}
        color={colors.pitchLine}
        style="stroke"
        strokeWidth={stroke}
      />
      <Rect
        x={centerX - smallBoxWidth / 2}
        y={height - margin - smallBoxDepth}
        width={smallBoxWidth}
        height={smallBoxDepth}
        color={colors.pitchLine}
        style="stroke"
        strokeWidth={stroke}
      />
    </Canvas>
  );
}

export default function PizarraScreen() {
  const insets = useSafeAreaInsets();
  const club = useAuthStore((state) => state.club);
  const formation = useLineupStore((state) => state.formation);
  const positions = useLineupStore((state) => state.positions);
  const restore = useLineupStore((state) => state.restore);
  const setFormation = useLineupStore((state) => state.setFormation);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [board, setBoard] = useState<BoardSize>({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    return () => {
      void ScreenOrientation.unlockAsync();
    };
  }, []);

  const load = useCallback(async () => {
    if (!club) {
      setError('No hay un club asignado a tu cuenta.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [playerPayload, lineup] = await Promise.all([
        api.get<unknown>(`/clubs/${encodeURIComponent(String(club.id))}/players`),
        api.get<LineupResponse | null>('/lineup'),
      ]);
      if (!isClubPlayerList(playerPayload)) {
        throw new Error('El servidor devolvió una lista de jugadores con formato inválido.');
      }
      setPlayers(playerPayload);
      const savedFormation = lineup && isFormationName(lineup.formation) ? lineup.formation : '4-3-3';
      const savedPositions = lineup ? sanitizePositions(lineup.positions) : {};
      restore(savedFormation, savedPositions);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la pizarra.');
    } finally {
      setLoading(false);
    }
  }, [club, restore]);

  useEffect(() => {
    void load();
  }, [load]);

  const assigned = useMemo(
    () => choosePlayers(players, FORMATIONS[formation]),
    [formation, players],
  );

  const handleViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const fieldWidth = Math.min(width, height * FIELD_RATIO);
    setBoard({ width: fieldWidth, height: fieldWidth / FIELD_RATIO });
  }, []);

  const handleFormationChange = (nextFormation: FormationName) => {
    if (nextFormation === formation) return;
    const nextAssignments = choosePlayers(players, FORMATIONS[nextFormation]);
    const nextPositions = Object.fromEntries(nextAssignments.map(({ player, slot }) => [
      String(player.id),
      { x: slot.x, y: slot.y },
    ]));
    setFormation(nextFormation, nextPositions);
    setMessage(null);
  };

  const save = async () => {
    if (assigned.length !== 11) {
      setError('Se necesitan 11 jugadores en el plantel para guardar la pizarra.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const savedPositions = Object.fromEntries(assigned.map(({ player, slot }) => {
        const position = positions[String(player.id)] ?? { x: slot.x, y: slot.y };
        return [String(player.id), position];
      }));
      const saved = await api.put<LineupResponse>('/lineup', {
        formation,
        positions: savedPositions,
      });
      restore(formation, sanitizePositions(saved.positions));
      setMessage('Pizarra guardada correctamente.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la pizarra.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>TÁCTICA DEL CLUB</Text>
          <Text style={styles.title}>Pizarra</Text>
          <Text style={styles.clubName}>{club?.name ?? 'Sin club'} · {assigned.length}/11 jugadores</Text>
        </View>
      </View>

      <View style={styles.controls}>
        {(['4-3-3', '4-4-2'] as const).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: formation === item }}
            onPress={() => handleFormationChange(item)}
            style={[styles.formationButton, formation === item && styles.formationButtonActive]}>
            <Text style={[styles.formationText, formation === item && styles.formationTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.statusText}>Cargando plantilla y formación...</Text>
        </View>
      ) : (
        <View style={styles.fieldArea} onLayout={handleViewportLayout}>
          {board.width > 0 && board.height > 0 ? (
            <View style={{ width: board.width, height: board.height }}>
              <TacticalField width={board.width} height={board.height} />
              {assigned.map(({ player, slot }) => (
                <TacticalToken
                  key={player.id}
                  player={player}
                  board={board}
                  position={positions[String(player.id)] ?? { x: slot.x, y: slot.y }}
                />
              ))}
            </View>
          ) : null}
        </View>
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(8, insets.bottom) }]}>
        {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
        {message ? <Text style={styles.successText}>{message}</Text> : null}
        {players.length < 11 && !loading ? (
          <Text style={styles.warningText}>Tu club no tiene suficientes jugadores para completar 11 posiciones.</Text>
        ) : null}
        <View style={styles.footerActions}>
          {error ? (
            <Pressable style={styles.secondaryButton} onPress={() => void load()}>
              <Text style={styles.secondaryButtonText}>Reintentar</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={loading || saving || assigned.length !== 11}
            onPress={() => void save()}
            style={[styles.saveButton, (loading || saving || assigned.length !== 11) && styles.disabledButton]}>
            {saving ? <ActivityIndicator color={colors.accentInk} /> : <Text style={styles.saveButtonText}>Guardar</Text>}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 12,
  },
  eyebrow: {
    color: colors.textSubtle,
    fontFamily: typography.bold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 32,
  },
  clubName: {
    color: colors.accent,
    fontFamily: typography.semibold,
    fontSize: 11,
    maxWidth: '45%',
    textAlign: 'right',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
  },
  formationButton: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  formationButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  formationText: {
    color: colors.textMuted,
    fontFamily: typography.semibold,
    fontSize: 13,
  },
  formationTextActive: {
    color: colors.accentInk,
  },
  fieldArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  token: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TOKEN_SIZE,
    height: TOKEN_SIZE,
    borderRadius: TOKEN_RADIUS,
    borderWidth: 2,
    borderColor: colors.pitchTokenBorder,
    backgroundColor: colors.pitchToken,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  tokenName: {
    color: colors.text,
    fontFamily: typography.bold,
    fontSize: 8,
    maxWidth: TOKEN_SIZE - 6,
  },
  tokenOverall: {
    color: colors.accent,
    fontFamily: typography.display,
    fontSize: 13,
    lineHeight: 15,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  statusText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  footer: {
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.medium,
    fontSize: 12,
  },
  successText: {
    color: colors.accent,
    fontFamily: typography.medium,
    fontSize: 12,
    fontWeight: '700',
  },
  warningText: {
    color: colors.pending,
    fontFamily: typography.medium,
    fontSize: 12,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  secondaryButton: {
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  secondaryButtonText: {
    color: colors.text,
    fontFamily: typography.semibold,
  },
  saveButton: {
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  saveButtonText: {
    color: colors.accentInk,
    fontFamily: typography.bold,
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
