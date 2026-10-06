import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth';
import { colors, radii, spacing, typography } from '@/theme';

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function LoginScreen() {
  const signIn = useAuthStore((state) => state.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!validEmail(email)) {
      setMessage('Escribe un correo electrónico válido.');
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setMessage('La contraseña debe tener entre 8 y 128 caracteres.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    const error = await signIn(email.trim(), password);
    if (error) setMessage(error);
    setSubmitting(false);
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.page}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
          <Text style={styles.eyebrow}>EA FC · TORNEO</Text>
          <Text style={styles.title}>Qué bueno verte</Text>
          <Text style={styles.subtitle}>Inicia sesión para volver a la competencia.</Text>

          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="Mínimo 8 caracteres"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.button, pressed && !submitting && styles.pressed, submitting && styles.disabled]}>
            {submitting
              ? <ActivityIndicator color={colors.accentInk} />
              : <Text style={styles.buttonText}>Iniciar sesión</Text>}
          </Pressable>

          <Text style={styles.switchText}>
            ¿Todavía no tienes cuenta?{' '}
            <Link href="/(auth)/register" style={styles.link}>Regístrate</Link>
          </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 12 },
  eyebrow: { color: colors.accent, fontFamily: typography.bold, fontSize: 11, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 40, marginTop: 8 },
  subtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 14, marginBottom: 16 },
  label: { color: colors.text, fontFamily: typography.semibold, fontSize: 12, marginTop: 4 },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, paddingHorizontal: 15, color: colors.text, backgroundColor: colors.surface, fontFamily: typography.body },
  error: { color: colors.danger, fontFamily: typography.medium, lineHeight: 20, marginTop: 4 },
  button: { minHeight: 52, backgroundColor: colors.accent, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { color: colors.accentInk, fontFamily: typography.bold, fontSize: 14 },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.65 },
  switchText: { color: colors.textMuted, fontFamily: typography.body, textAlign: 'center', marginTop: 12 },
  link: { color: colors.accent, fontFamily: typography.bold },
});
