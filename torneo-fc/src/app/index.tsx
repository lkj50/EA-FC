import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/auth';

export default function IndexRoute() {
  const tokens = useAuthStore((state) => state.tokens);
  const club = useAuthStore((state) => state.club);

  if (!tokens) return <Redirect href="/(auth)/login" />;
  if (!club) return <Redirect href="/roulette" />;
  return <Redirect href="/(app)" />;
}
