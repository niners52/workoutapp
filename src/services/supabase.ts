import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
