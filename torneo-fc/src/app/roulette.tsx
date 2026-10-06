import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type Club } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { colors, radii, spacing, typography } from '@/theme';

const WHEEL_SIZE = 300;
const WHEEL_RADIUS = WHEEL_SIZE / 2;
const SEGMENT_COLORS = [colors.accent, colors.wheelShade1, colors.wheelShade2, colors.wheelShade3, colors.wheelShade4, colors.wheelShade5];

function normalizeClubResponse(payload: unknown): Club {
  const result = Array.isArray(payload) && payload.length === 1 ? payload[0] : payload;
  if (
    typeof result !== 'object'
    || result === null
    || !('id' in result)
    || (typeof result.id !== 'string' && (typeof result.id !== 'number' || !Number.isSafeInteger(result.id)))
    || !('name' in result)
    || typeof result.name !== 'string'
    || !('league' in result)
    || typeof result.league !== 'string'
    || !('country' in result)
    || typeof result.country !== 'string'
    || !('logo_url' in result)
    || (typeof result.logo_url !== 'string' && result.logo_url !== null)
  ) {
    throw new Error('El servidor no devolvió un club válido.');
  }
  return {
    id: result.id,
    name: result.name,
    league: result.league,
    country: result.country,
    logo_url: result.logo_url,
  };
}

export default function RouletteScreen() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState('');
  const rotation = useRef(new Animated.Value(0)).current;
  const spinningLock = useRef(false);
  const setClub = useAuthStore((state) => state.setClub);

  useEffect(() => {
    let active = true;
    api.get<Club[]>('/clubs')
      .then((result) => {
        if (active) setClubs(result);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los clubes.');
      })
      .finally(() => {
        if (active) setLoadingClubs(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const segmentAngle = clubs.length > 0 ? 360 / clubs.length : 0;
  const rotationDegrees = useMemo(
    () => rotation.interpolate({
      inputRange: [0, 360],
      outputRange: ['0deg', '360deg'],
      extrapolate: 'extend',
    }),
    [rotation],
  );

  const spin = async () => {
    if (spinningLock.current || clubs.length === 0) return;

    spinningLock.current = true;
    setSpinning(true);
    setError('');
    setSelectedClub(null);
    try {
      // El servidor aplica la asignación persistente; el cliente solo anima hasta el club recibido.
      const response = await api.post<unknown>('/roulette', {});
      const result = normalizeClubResponse(response);
      const resultIndex = clubs.findIndex((club) => String(club.id) === String(result.id));
      if (resultIndex < 0) {
        throw new Error('El club asignado no aparece en la lista devuelta por el servidor.');
      }

      const targetAngle = 360 * 5 - resultIndex * segmentAngle;
      Animated.timing(rotation, {
        toValue: targetAngle,
        duration: 5200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          spinningLock.current = false;
          setSpinning(false);
          return;
        }
        setSelectedClub(result);
        setClub(result);
        spinningLock.current = false;
        setSpinning(false);
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo girar la ruleta.');
      spinningLock.current = false;
      setSpinning(false);
    }
  };

  const labels = clubs.map((club, index) => {
    const angle = (index * segmentAngle - 90) * (Math.PI / 180);
    const labelRadius = WHEEL_SIZE * 0.34;
    const left = WHEEL_RADIUS + Math.cos(angle) * labelRadius - 37;
    const top = WHEEL_RADIUS + Math.sin(angle) * labelRadius - 13;
    return (
      <View key={club.id} style={[styles.label, { left, top }]}>
        <Text numberOfLines={1} style={styles.labelText}>{club.name}</Text>
      </View>
    );
  });

  const wedges = clubs.map((club, index) => {
    if (clubs.length < 3) return null;
    const sideWidth = WHEEL_RADIUS * Math.tan(Math.PI / clubs.length);
    return (
      <View
        key={club.id}
        style={[styles.wedgeContainer, { transform: [{ rotate: `${index * segmentAngle}deg` }] }]}>
        <View
          style={[
            styles.wedge,
            {
              left: WHEEL_RADIUS - sideWidth,
              borderLeftWidth: sideWidth,
              borderRightWidth: sideWidth,
              borderTopWidth: WHEEL_RADIUS,
              borderTopColor: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
            },
          ]}
        />
      </View>
    );
  });

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      <Text style={styles.eyebrow}>EA FC · TORNEO</Text>
      <Text style={styles.title}>Elige tu club</Text>
      <Text style={styles.subtitle}>Tu asignación queda guardada para el torneo.</Text>

      {loadingClubs ? (
        <ActivityIndicator color={colors.accent} size="large" style={styles.loading} />
      ) : (
        <>
          <View style={styles.wheelArea}>
            <View style={styles.pointer} />
            <Animated.View style={[styles.wheel, { transform: [{ rotate: rotationDegrees }] }]}>
                {clubs.length === 2 ? (
                  <>
                    <View style={[styles.halfWheel, styles.leftHalf, { backgroundColor: SEGMENT_COLORS[0] }]} />
                    <View style={[styles.halfWheel, styles.rightHalf, { backgroundColor: SEGMENT_COLORS[1] }]} />
                  </>
                ) : null}
                {wedges}
              {labels}
              <View style={styles.hub} />
            </Animated.View>
          </View>

          {selectedClub ? (
            <View style={styles.result}>
              {selectedClub.logo_url ? (
                <Image source={{ uri: selectedClub.logo_url }} style={styles.logo} resizeMode="contain" />
              ) : null}
              <Text style={styles.clubName}>{selectedClub.name}</Text>
              <Text style={styles.league}>{selectedClub.league}</Text>
            </View>
          ) : null}

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {clubs.length === 0 && !error ? (
            <Text style={styles.error}>El servidor todavía no ha publicado clubes.</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={spinning || clubs.length === 0}
            onPress={() => void spin()}
            style={({ pressed }) => [
              styles.button,
              pressed && !spinning && styles.pressed,
              (spinning || clubs.length === 0) && styles.disabled,
            ]}>
            {spinning
              ? <ActivityIndicator color={colors.accentInk} />
              : <Text style={styles.buttonText}>Girar</Text>}
          </Pressable>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, backgroundColor: colors.background },
  eyebrow: { color: colors.accent, fontFamily: typography.bold, fontSize: 11, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 38, marginTop: 10 },
  subtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 13, marginTop: 8, textAlign: 'center' },
  loading: { marginTop: 50 },
  wheelArea: { width: WHEEL_SIZE, height: WHEEL_SIZE + 20, alignItems: 'center', justifyContent: 'flex-end', marginTop: 30 },
  pointer: { position: 'absolute', top: 0, zIndex: 5, width: 0, height: 0, borderLeftWidth: 13, borderRightWidth: 13, borderTopWidth: 25, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.text },
  wheel: { width: WHEEL_SIZE, height: WHEEL_SIZE, overflow: 'hidden', borderRadius: WHEEL_RADIUS, borderColor: colors.borderStrong, borderWidth: 4, backgroundColor: colors.surfaceRaised },
  wedgeContainer: { position: 'absolute', width: WHEEL_SIZE, height: WHEEL_SIZE, top: 0, left: 0 },
  halfWheel: { position: 'absolute', width: WHEEL_RADIUS, height: WHEEL_SIZE, top: 0 },
  leftHalf: { left: 0, borderTopLeftRadius: WHEEL_RADIUS, borderBottomLeftRadius: WHEEL_RADIUS },
  rightHalf: { right: 0, borderTopRightRadius: WHEEL_RADIUS, borderBottomRightRadius: WHEEL_RADIUS },
  wedge: { position: 'absolute', top: 0, width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  label: { position: 'absolute', width: 74, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 3, borderRadius: radii.sm, backgroundColor: colors.wheelLabelOverlay },
  labelText: { color: colors.text, fontFamily: typography.semibold, fontSize: 9, textAlign: 'center' },
  hub: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text, borderWidth: 5, borderColor: colors.accent, left: WHEEL_RADIUS - 12, top: WHEEL_RADIUS - 12 },
  result: { alignItems: 'center', marginTop: spacing.lg },
  logo: { width: 54, height: 54, marginBottom: 6 },
  clubName: { color: colors.text, fontFamily: typography.display, fontSize: 29 },
  league: { color: colors.accent, fontFamily: typography.medium, marginTop: 4 },
  error: { color: colors.danger, fontFamily: typography.medium, textAlign: 'center', marginTop: 14 },
  button: { width: '100%', maxWidth: 360, height: 52, backgroundColor: colors.accent, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  buttonText: { color: colors.accentInk, fontFamily: typography.bold, fontSize: 15 },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.65 },
});
