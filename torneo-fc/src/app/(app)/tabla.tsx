import { Image } from 'expo-image';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth';
import { useStandings } from '@/hooks/useStandings';
import { colors, radii, spacing, typography } from '@/theme';

const columns = [
  { key: 'pj', label: 'PJ' },
  { key: 'pg', label: 'PG' },
  { key: 'pe', label: 'PE' },
  { key: 'pp', label: 'PP' },
  { key: 'gf', label: 'GF' },
  { key: 'gc', label: 'GC' },
  { key: 'dg', label: 'DG' },
  { key: 'pts', label: 'PTS' },
] as const;

export default function TablaScreen() {
  const userId = useAuthStore((state) => state.profile?.id);
  const { standings, loading, refreshing, error, refresh } = useStandings();
  const onRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}>
      <Text style={styles.eyebrow}>TORNEO</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={styles.title}>Tabla de posiciones</Text>
      <Text style={styles.subtitle}>Clasificación oficial del torneo</Text>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.accent} size="large" style={styles.loader} /> : null}
      {!loading && !error && standings.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Aún no hay partidos confirmados</Text>
          <Text style={styles.emptyText}>La tabla aparecerá cuando se confirmen los primeros resultados.</Text>
        </View>
      ) : null}

      {!loading && standings.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.headerCell, styles.positionCell]}>#</Text>
              <Text style={[styles.headerCell, styles.clubCell]}>CLUB / JUGADOR</Text>
              {columns.map((column) => (
                <Text key={column.key} style={[styles.headerCell, styles.statCell]}>{column.label}</Text>
              ))}
            </View>
            {standings.map((row, index) => {
              const currentUser = row.user_id === userId;
              return (
                <View key={row.user_id} style={[styles.row, styles.dataRow, index === 0 && styles.leaderRow, currentUser && styles.currentUserRow]}>
                  <Text style={[styles.position, styles.positionCell, index === 0 && styles.leaderPosition]}>{index + 1}</Text>
                  <View style={[styles.clubCell, styles.clubInfo]}>
                    {row.logo_url ? (
                      <Image contentFit="contain" source={{ uri: row.logo_url }} style={styles.logo} />
                    ) : <View style={styles.logoPlaceholder} />}
                    <View style={styles.clubTexts}>
                      <Text numberOfLines={1} style={[styles.clubName, currentUser && styles.highlightText]}>{row.club_name}</Text>
                      <Text numberOfLines={1} style={styles.username}>{row.username}</Text>
                    </View>
                  </View>
                  {columns.map((column) => (
                    <Text
                      key={column.key}
                      style={[
                        styles.statCell,
                        styles.statText,
                        column.key === 'pts' && styles.points,
                        currentUser && styles.highlightText,
                      ]}>
                      {row[column.key]}
                    </Text>
                  ))}
                </View>
              );
            })}
          </View>
        </ScrollView>
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
  title: { color: colors.text, fontFamily: typography.display, fontSize: 30, marginTop: spacing.sm },
  subtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 13, marginTop: 5, marginBottom: spacing.xl },
  loader: { marginTop: 35 },
  error: { color: colors.danger, fontFamily: typography.medium, marginVertical: 16 },
  empty: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, backgroundColor: colors.surface, marginTop: 20, padding: 24 },
  emptyTitle: { color: colors.text, fontFamily: typography.bold, fontSize: 16, textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
  table: { borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden', backgroundColor: colors.surface },
  row: { alignItems: 'center', flexDirection: 'row' },
  headerRow: { backgroundColor: colors.surfaceRaised, minHeight: 42 },
  dataRow: { borderTopColor: colors.border, borderTopWidth: 1, minHeight: 64 },
  currentUserRow: { backgroundColor: colors.currentUserSurface },
  leaderRow: { backgroundColor: colors.leaderSurface },
  headerCell: { color: colors.textMuted, fontFamily: typography.bold, fontSize: 9, textAlign: 'center' },
  positionCell: { width: 42 },
  clubCell: { width: 190 },
  statCell: { width: 44 },
  position: { color: colors.accent, fontFamily: typography.display, fontSize: 20, textAlign: 'center', fontVariant: ['tabular-nums'] },
  leaderPosition: { color: colors.accentPressed },
  clubInfo: { alignItems: 'center', flexDirection: 'row', gap: 9, paddingHorizontal: 8 },
  logo: { width: 34, height: 34 },
  logoPlaceholder: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceMuted },
  clubTexts: { flex: 1 },
  clubName: { color: colors.text, fontFamily: typography.bold, fontSize: 12 },
  username: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, marginTop: 3 },
  statText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, textAlign: 'center', fontVariant: ['tabular-nums'] },
  points: { color: colors.text, fontFamily: typography.bold },
  highlightText: { color: colors.accent },
});
