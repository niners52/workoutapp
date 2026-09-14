import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';

interface State {
  error: Error | null;
}

/**
 * Last line of defence for render errors. A release build closes the app on an
 * uncaught render error; this shows the message instead so it can be reported.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>The app hit an error while drawing this screen. A screenshot of this page helps fix it.</Text>
          <Text selectable style={styles.message}>
            {error.name}: {error.message}
          </Text>
          {error.stack ? (
            <Text selectable style={styles.stack}>
              {error.stack.split('\n').slice(0, 10).join('\n')}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={() => this.setState({ error: null })}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl * 1.5,
    paddingBottom: spacing.xxxl,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  message: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.error,
    marginBottom: spacing.md,
  },
  stack: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    fontFamily: 'Menlo',
  },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
});

export default AppErrorBoundary;
