import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import { colors, typography, spacing, borderRadius } from '../theme';
import { useAuth } from '../contexts/AuthContext';

export function AuthScreen() {
  const { signIn, signUp, signInWithApple, enableOfflineMode } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const isAppleSignInSupported = Platform.OS === 'ios' && appleAuth.isSupported;

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    try {
      await signInWithApple();
      // If successful, AuthContext will update and navigation will switch automatically
    } catch (error: any) {
      // Ignore user cancellation
      if (error.code !== '1001' && !error.message?.includes('canceled')) {
        Alert.alert('Apple Sign In Failed', error.message || 'Something went wrong');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter both email and password.');
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }

    if (isSignUp && password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email.trim(), password);
        if (error) {
          Alert.alert('Sign Up Failed', error);
        } else {
          Alert.alert(
            'Check Your Email',
            'We sent you a confirmation link. Please verify your email, then sign in.',
            [{ text: 'OK', onPress: () => setIsSignUp(false) }]
          );
        }
      } else {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          Alert.alert('Sign In Failed', error);
        }
        // If successful, AuthContext will update and navigation will switch automatically
      }
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setConfirmPassword('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.appName}>Workout Tracker</Text>
            <Text style={styles.tagline}>Track your lifts. Hit your goals.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </Text>

            {/* Apple Sign In Button */}
            {isAppleSignInSupported && !isSignUp && (
              <>
                <TouchableOpacity
                  style={[styles.appleButton, appleLoading && styles.appleButtonDisabled]}
                  onPress={handleAppleSignIn}
                  disabled={appleLoading || loading}
                  activeOpacity={0.8}
                >
                  {appleLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.appleButtonText}> Sign in with Apple</Text>
                  )}
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>
              </>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                editable={!loading}
              />
            </View>

            {isSignUp && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toggleButton}
              onPress={toggleMode}
              disabled={loading}
            >
              <Text style={styles.toggleText}>
                {isSignUp
                  ? 'Already have an account? Sign In'
                  : "Don't have an account? Sign Up"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Continue Offline — prominent, always available so users locked out
              of cloud sign-in (e.g., Apple Sign In errors) can still reach their
              local data. */}
          <TouchableOpacity
            style={styles.offlineButton}
            onPress={() => {
              Alert.alert(
                'Continue Offline',
                'Use your local workout history without signing in. You can sign in later from Settings to enable cloud sync.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Continue Offline',
                    onPress: () => {
                      enableOfflineMode().catch(e =>
                        Alert.alert('Error', e?.message || 'Failed to enter offline mode')
                      );
                    },
                  },
                ]
              );
            }}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.offlineButtonText}>Continue Offline</Text>
          </TouchableOpacity>
          <Text style={styles.offlineHint}>
            Access your local data without signing in. Cloud sync stays off until you log in.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
  },
  formTitle: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.size.base,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.surfaceLight,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.background,
  },
  toggleButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: typography.size.sm,
    color: colors.primary,
  },
  offlineButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceLight,
  },
  offlineButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  offlineHint: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  appleButton: {
    backgroundColor: '#000000',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginBottom: spacing.md,
  },
  appleButtonDisabled: {
    opacity: 0.6,
  },
  appleButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: '#FFFFFF',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.surfaceLight,
  },
  dividerText: {
    paddingHorizontal: spacing.md,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
});

export default AuthScreen;
