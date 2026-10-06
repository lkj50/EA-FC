import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth';
import { useTournament } from '@/hooks/useTournament';
import { colors, radii, spacing, typography } from '@/theme';

const STATUS_LABELS = {
  registro: 'Registro',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
} as const;

export default function HomeScreen() {
  const profile = useAuthStore((state) => state.profile);
  const club = useAuthStore((state) => state.club);
  const signOut = useAuthStore((state) => state.signOut);
  const { tournament } = useTournament();
  const [error, setError] = useState('');
  const currentTournament = tournament?.tournament;
  const currentDate = tournament?.current_date
    ? new Date(tournament.current_date).toLocaleDateString('es')
    : 'Fecha no disponible';

  const handleSignOut = async () => {
    const result = await signOut();
    setError(result ?? '');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>EA FC · TORNEO</Text>
        <Text style={styles.title}>Hola, {profile?.username ?? 'jugador'}</Text>
        <Text style={styles.subtitle}>Tu torneo empieza aquí.</Text>

        <Animated.View entering={FadeInDown.duration(260)} style={styles.tournamentBanner}>
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerLabel}>ESTADO DEL TORNEO</Text>
            <Text style={styles.bannerStatus}>
              {currentTournament ? STATUS_LABELS[currentTournament.status] : 'No disponible'}
            </Text>
          </View>
          <View style={styles.roundBadge}>
            <Text style={styles.roundLabel}>FECHA HABILITADA</Text>
            <Text style={styles.roundValue}>
              {currentTournament?.current_round ? `Fecha ${currentTournament.current_round}` : '—'}
            </Text>
            <Text style={styles.currentDate}>{currentDate}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).duration(280)} style={styles.card}>
          {club?.logo_url ? (
            <Image contentFit="contain" source={{ uri: club.logo_url }} style={styles.logo} />
          ) : null}
          <Text style={styles.clubName}>{club?.name ?? 'Sin club asignado'}</Text>
          {club ? <Text style={styles.league}>{club.league}</Text> : null}
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{profile?.role === 'admin' ? 'Administrador' : 'Jugador'}</Text>
          </View>
        </Animated.View>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable onPress={() => void handleSignOut()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  eyebrow: { color: colors.accent, fontFamily: typography.bold, fontSize: 11, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 38, marginTop: spacing.md },
  subtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 14, marginTop: spacing.sm },
  tournamentBanner: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl, padding: spacing.lg },
  bannerCopy: { flex: 1 },
  bannerLabel: { color: colors.textSubtle, fontFamily: typography.bold, fontSize: 9, letterSpacing: 1 },
  bannerStatus: { color: colors.accent, fontFamily: typography.display, fontSize: 24, marginTop: 5 },
  roundBadge: { alignItems: 'flex-end', paddingLeft: spacing.sm },
  roundLabel: { color: colors.textSubtle, fontFamily: typography.bold, fontSize: 8, letterSpacing: 0.5 },
  roundValue: { color: colors.text, fontFamily: typography.display, fontSize: 20, marginTop: 5 },
  currentDate: { color: colors.textSubtle, fontFamily: typography.body, fontSize: 9, marginTop: 4 },
  card: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, marginTop: spacing.xxl, minHeight: 210, justifyContent: 'center', padding: spacing.xl },
  logo: { width: 76, height: 76, marginBottom: 12 },
  clubName: { color: colors.text, fontFamily: typography.display, fontSize: 30, textAlign: 'center' },
  league: { color: colors.textMuted, fontFamily: typography.body, fontSize: 14, marginTop: 6 },
  roleBadge: { backgroundColor: colors.roleSurface, borderRadius: radii.pill, marginTop: 18, paddingHorizontal: 14, paddingVertical: 7 },
  roleText: { color: colors.roleText, fontFamily: typography.bold, fontSize: 11 },
  error: { color: colors.danger, fontFamily: typography.medium, marginTop: 16, textAlign: 'center' },
  button: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong, borderRadius: radii.sm, borderWidth: 1, justifyContent: 'center', marginTop: 20, minHeight: 50 },
  buttonText: { color: colors.text, fontFamily: typography.semibold, fontSize: 13 },
  pressed: { opacity: 0.75 },
});
