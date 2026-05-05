import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://phwnpxlsawuacdigfwhv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBod25weGxzYXd1YWNkaWdmd2h2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDA2MjQsImV4cCI6MjA5MzUxNjYyNH0.hEvGaLnfE2yIR7V4HcOtZsQF1TE9DwCiB4u4R8FaGw4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});
