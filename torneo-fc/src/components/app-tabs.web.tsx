import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth';
import { colors, typography } from '@/theme';

export default function AppTabs() {
  const isAdmin = useAuthStore((state) => state.profile?.role === 'admin');
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 8 : 6),
          height: (Platform.OS === 'ios' ? 56 : 54) + Math.max(insets.bottom, Platform.OS === 'ios' ? 8 : 6),
        },
        tabBarLabelStyle: { fontFamily: typography.semibold, fontSize: 10 },
      }}>
      <Tabs.Screen name="index" options={{
        title: 'Inicio',
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />,
      }} />
      <Tabs.Screen name="tabla" options={{
        title: 'Tabla',
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'podium' : 'podium-outline'} color={color} size={size} />,
      }} />
      <Tabs.Screen name="partidos" options={{
        title: 'Partidos',
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={size} />,
      }} />
      <Tabs.Screen name="pizarra" options={{
        title: 'Pizarra',
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'clipboard' : 'clipboard-outline'} color={color} size={size} />,
      }} />
      {/* href null solo oculta la pestaña; requireAdmin y RLS siguen protegiendo el recurso. */}
      <Tabs.Screen name="admin" options={{
        title: 'Admin',
        href: isAdmin ? '/admin' : null,
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'} color={color} size={size} />,
      }} />
    </Tabs>
  );
}
