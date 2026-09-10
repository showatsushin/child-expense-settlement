function configurationError() { return new Error('Supabase認証の設定がありません。VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。'); }

export function createAuthService({ url, anonKey, clientFactory } = {}) {
  if (!url || !anonKey) return {
    configured: false,
    signIn: async () => { throw configurationError(); }, signOut: async () => {}, getSession: async () => null,
    onAuthStateChange: () => ({ unsubscribe() {} }),
  };
  const factory = clientFactory || globalThis.supabase?.createClient;
  if (!factory) throw new Error('Supabase SDKを読み込めませんでした。');
  const client = factory(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return {
    configured: true,
    async signIn(email, password) { const { data, error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; return data.session; },
    async signOut() { const { error } = await client.auth.signOut(); if (error) throw error; },
    async getSession() { const { data, error } = await client.auth.getSession(); if (error) throw error; return data.session; },
    onAuthStateChange(callback) { const { data } = client.auth.onAuthStateChange((_event, session) => callback(session)); return data.subscription; },
  };
}
