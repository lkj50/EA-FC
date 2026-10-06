import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { connectSocket, disconnectSocket, subscribeToSocketReconnect } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { useMatchRoomStore } from '@/store/matchRoom';
import { colors } from '@/theme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const loading = useAuthStore((state) => state.loading);
  const tokens = useAuthStore((state) => state.tokens);
  const club = useAuthStore((state) => state.club);
  const initialize = useAuthStore((state) => state.initialize);
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!tokens) {
      disconnectSocket();
      useMatchRoomStore.getState().resetSession();
      return;
    }

    const socket = connectSocket(tokens.access_token);
    const unsubscribeReconnect = subscribeToSocketReconnect(() => {
      void useMatchRoomStore.getState().syncOfflineQueue();
    });
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected) void useMatchRoomStore.getState().syncOfflineQueue();
    });
    void NetInfo.fetch().then((state) => {
      if (state.isConnected) void useMatchRoomStore.getState().syncOfflineQueue();
    });

    return () => {
      unsubscribeReconnect();
      unsubscribeNetwork();
      disconnectSocket(socket);
    };
  }, [tokens]);

  if (loading || (!fontsLoaded && !fontError)) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!tokens}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected guard={Boolean(tokens && !club)}>
              <Stack.Screen name="roulette" />
            </Stack.Protected>
            <Stack.Protected guard={Boolean(tokens && club)}>
              <Stack.Screen name="(app)" />
              <Stack.Screen name="match/[id]" />
            </Stack.Protected>
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
