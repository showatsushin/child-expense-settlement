import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../src/services/auth.js';
import { namespaceForUser } from '../src/user-storage.js';

function fakeClient() {
  let session = null; let listener = null;
  return { auth: {
    async signInWithPassword({ email, password }) { if (email !== 'user@example.test' || password !== 'correct-password') return { data: {}, error: new Error('Invalid login credentials') }; session = { access_token: 'session-token', user: { id: 'user-a', email } }; listener?.('SIGNED_IN', session); return { data: { session }, error: null }; },
    async signOut() { session = null; listener?.('SIGNED_OUT', null); return { error: null }; },
    async getSession() { return { data: { session }, error: null }; },
    onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() { listener = null; } } } }; },
  } };
}

test('未設定の認証サービスはアプリ利用を許可しない', async () => { const auth = createAuthService(); assert.equal(auth.configured, false); await assert.rejects(auth.signIn('a', 'b'), /設定がありません/); assert.equal(await auth.getSession(), null); });
test('正常loginとsession復元', async () => { const auth = createAuthService({ url:'https://project.supabase.co', anonKey:'public-anon', clientFactory:() => fakeClient() }); const session = await auth.signIn('user@example.test','correct-password'); assert.equal(session.user.id,'user-a'); assert.equal((await auth.getSession()).user.email,'user@example.test'); });
test('login失敗は認証エラーとして返す', async () => { const auth = createAuthService({ url:'x', anonKey:'y', clientFactory:() => fakeClient() }); await assert.rejects(auth.signIn('user@example.test','bad'), /Invalid login credentials/); });
test('logoutでSupabase sessionを破棄する', async () => { const auth = createAuthService({ url:'x', anonKey:'y', clientFactory:() => fakeClient() }); await auth.signIn('user@example.test','correct-password'); await auth.signOut(); assert.equal(await auth.getSession(), null); });
test('認証状態変更を購読できる', async () => { const auth = createAuthService({ url:'x', anonKey:'y', clientFactory:() => fakeClient() }); const events=[]; auth.onAuthStateChange((session)=>events.push(session?.user.id || null)); await auth.signIn('user@example.test','correct-password'); await auth.signOut(); assert.deepEqual(events,['user-a',null]); });
test('user Aとuser Bの保存namespaceは分離される', () => { assert.equal(namespaceForUser('user A'), 'child-expense-settlement:user%20A:'); assert.notEqual(namespaceForUser('user A'), namespaceForUser('user-b')); });
test('legacy Phase 2 keyは認証済みnamespaceに混入しない', () => { assert.ok(!namespaceForUser('user-a').includes('ces.records.v1')); assert.match(namespaceForUser('user-a'), /^child-expense-settlement:user-a:/); });
