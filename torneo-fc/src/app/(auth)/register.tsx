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
import { REGISTER_CONFIRMATION_MESSAGE, useAuthStore } from '@/store/auth';
import { colors, radii, spacing, typography } from '@/theme';

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function RegisterScreen() {
  const signUp = useAuthStore((state) => state.signUp);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!validEmail(email)) {
      setConfirmed(false);
      setMessage('Escribe un correo electrónico válido.');
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setConfirmed(false);
      setMessage('La contraseña debe tener entre 8 y 128 caracteres.');
      return;
    }
    if (username.trim().length < 3 || username.trim().length > 24) {
      setConfirmed(false);
      setMessage('El nombre de usuario debe tener entre 3 y 24 caracteres.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    setConfirmed(false);
    const error = await signUp(email.trim(), password, username.trim());
    if (error) {
      setMessage(error);
      setConfirmed(error === REGISTER_CONFIRMATION_MESSAGE);
    }
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
          <Text style={styles.title}>Crea tu cuenta</Text>
          <Text style={styles.subtitle}>Regístrate para entrar al torneo.</Text>

          <Text style={styles.label}>Nombre de usuario</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="username"
            onChangeText={setUsername}
            placeholder="Al menos 3 caracteres"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
            value={username}
          />

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
            autoComplete="new-password"
            onChangeText={setPassword}
            placeholder="Mínimo 8 caracteres"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {message ? (
            <Text accessibilityRole="alert" style={confirmed ? styles.notice : styles.error}>{message}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.button, pressed && !submitting && styles.pressed, submitting && styles.disabled]}>
            {submitting
              ? <ActivityIndicator color={colors.accentInk} />
              : <Text style={styles.buttonText}>Crear cuenta</Text>}
          </Pressable>

          <Text style={styles.switchText}>
            ¿Ya tienes cuenta?{' '}
            <Link href="/(auth)/login" style={styles.link}>Inicia sesión</Link>
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
  notice: { color: colors.accent, fontFamily: typography.medium, lineHeight: 20, marginTop: 4 },
  button: { minHeight: 52, backgroundColor: colors.accent, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { color: colors.accentInk, fontFamily: typography.bold, fontSize: 14 },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.65 },
  switchText: { color: colors.textMuted, fontFamily: typography.body, textAlign: 'center', marginTop: 12 },
  link: { color: colors.accent, fontFamily: typography.bold },
});
