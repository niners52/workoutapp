import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, User } from '@supabase/supabase-js';
import { supabase, signInWithApple as signInWithAppleService } from '../services/supabase';

const AUTH_SKIPPED_KEY = 'auth_skipped';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // True when the user chose "Continue without an account" — lets them use local data
  // without signing in. Cloud sync features should be gated on `isAuthenticated`, not this.
  isOfflineMode: boolean;
  enableOfflineMode: () => Promise<void>;
  exitOfflineMode: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  useEffect(() => {
    // Load the offline-mode flag from storage in parallel with the session check so the
    // navigator only un-blocks once we know both. Without this, the user could see the
    // auth screen flash even when they previously chose "Continue Offline".
    Promise.all([
      supabase.auth.getSession(),
      AsyncStorage.getItem(AUTH_SKIPPED_KEY),
    ]).then(([{ data: { session } }, skipped]) => {
      setSession(session);
      setIsOfflineMode(skipped === 'true');
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const enableOfflineMode = useCallback(async () => {
    await AsyncStorage.setItem(AUTH_SKIPPED_KEY, 'true');
    setIsOfflineMode(true);
  }, []);

  const exitOfflineMode = useCallback(async () => {
    await AsyncStorage.removeItem(AUTH_SKIPPED_KEY);
    setIsOfflineMode(false);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }
    return { error: null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const signInWithApple = useCallback(async () => {
    try {
      await signInWithAppleService();
      // Auth state change listener will handle the rest
    } catch (error: any) {
      // Don't throw for user cancellation
      if (error.code === '1001' || error.message?.includes('canceled')) {
        return;
      }
      throw error;
    }
  }, []);

  const value: AuthContextType = {
    session,
    user: session?.user ?? null,
    isLoading,
    isAuthenticated: !!session,
    isOfflineMode,
    enableOfflineMode,
    exitOfflineMode,
    signUp,
    signIn,
    signInWithApple,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
