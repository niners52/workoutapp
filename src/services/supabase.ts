import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appleAuth } from '@invertase/react-native-apple-authentication';

const SUPABASE_URL = 'https://irjstbtfhzxhnonfzhrx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nMRLmSgGdJ2BejaZlJ49jQ_BisEDZb-'; // TODO: Replace with your anon key starting with eyJ...

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Important for React Native
  },
});

export async function signInWithApple() {
  // Perform Apple auth request
  const appleAuthRequestResponse = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
  });

  // Get the credential state
  const credentialState = await appleAuth.getCredentialStateForUser(
    appleAuthRequestResponse.user
  );

  if (credentialState !== appleAuth.State.AUTHORIZED) {
    throw new Error('Apple Sign In not authorized');
  }

  const { identityToken, fullName } = appleAuthRequestResponse;

  if (!identityToken) {
    throw new Error('No identity token returned from Apple');
  }

  // Sign in with Supabase using the Apple ID token
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
  });

  if (error) throw error;

  // Apple only returns the name on FIRST sign in, so save it to profile if available
  if (fullName?.givenName || fullName?.familyName) {
    const displayName = [fullName.givenName, fullName.familyName].filter(Boolean).join(' ');
    if (displayName && data.user) {
      await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('user_id', data.user.id);
    }
  }

  return data;
}
