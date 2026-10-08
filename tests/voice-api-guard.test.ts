import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/[...route].ts';

test('live API routes reject expired clones before any credit or generation request', async (t) => {
  const env = { ...process.env };
  Object.assign(process.env, {
    SUPABASE_URL: 'https://voice-test.supabase.co', SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service', SUNO_API_KEY: 'test-suno',
    SUNO_API_BASE_URL: 'https://voice-provider.test', ADMIN_EMAILS: '', ADMIN_EMAIL: '',
  });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; process.env = env; });
  const voice = { id: 'saved-voice', user_id: 'owner', suno_voice_id: 'voice', last_task_id: 'task', status: 'ready', name: 'José' };
  for (const route of ['generate', 'extend', 'upload-cover']) {
    const calls: { url: URL; method: string; body: any }[] = [];
    globalThis.fetch = async (input: any, init: any = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const method = init.method || 'GET';
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url, method, body });
      const json = (data: any) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.pathname === '/auth/v1/user') return json({ id: 'owner', email: 'ordinary@example.test' });
      if (url.pathname === '/rest/v1/suno_voices') {
        assert.equal(url.searchParams.get('user_id'), 'eq.owner');
        if (method === 'PATCH') {
          assert.equal(body.status, 'expired');
          assert.deepEqual(Object.keys(body).sort(), ['status', 'updated_at']);
          return json(null);
        }
        return json(voice);
      }
      if (url.pathname === '/api/v1/voice/record-info') return json({ code: 200, data: { status: 'success', voiceId: 'voice', errorCode: 400, errorMessage: 'The voice has expired' } });
      throw new Error(`Unexpected request before rejecting expired voice: ${url.pathname}`);
    };
    const req = {
      method: 'POST', url: `/api/suno/${route}`, headers: { authorization: 'Bearer test-user', host: 'localhost' },
      body: { prompt: 'Test lyrics', title: 'Test', style: 'Pop', model: 'V6', customMode: true, defaultParamFlag: true, audioId: 'audio', uploadUrl: 'https://audio.test/source.mp3', personaId: 'voice', personaModel: 'voice_persona' },
    };
    const res = { statusCode: 0, body: null as any, setHeader() {}, end(value: string) { this.body = JSON.parse(value); } };
    await handler(req, res);
    assert.equal(res.statusCode, 409, `${route}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, 'VOICE_EXPIRED');
    assert.equal(calls.some(c => /profiles|credits|generate$|cover$|storage/.test(c.url.pathname)), false);
  }
});

test('confirmed clone reaches generation unchanged; provider outage does not expire or charge it', async (t) => {
  const env = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'https://voice-test.supabase.co', SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', SUNO_API_KEY: 'test', SUNO_API_BASE_URL: 'https://voice-provider.test', ADMIN_EMAILS: 'admin@example.test' });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; process.env = env; });
  for (const outage of [false, true]) {
    const calls: string[] = [];
    globalThis.fetch = async (input: any, init: any = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      calls.push(`${init.method || 'GET'} ${url.pathname}`);
      const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      if (url.pathname === '/auth/v1/user') return json({ id: 'owner', email: 'admin@example.test' });
      if (url.pathname === '/rest/v1/suno_voices') {
        assert.notEqual(init.method, 'PATCH', 'a transient outage must not change saved status');
        return json({ id: 'saved', user_id: 'owner', suno_voice_id: 'voice', last_task_id: 'task', status: 'ready' });
      }
      if (url.pathname === '/api/v1/voice/record-info') return json(outage ? { code: 503 } : { code: 200, data: { status: 'success', voiceId: 'voice' } }, outage ? 503 : 200);
      if (url.pathname === '/api/v1/voice/check-voice') return json({ code: 200, data: { isAvailable: true } });
      if (url.pathname === '/api/v1/generate') {
        const body = JSON.parse(init.body);
        assert.equal(body.personaId, 'voice');
        assert.equal(body.personaModel, 'voice_persona');
        return json({ code: 200, data: { taskId: 'generated-test-task' } });
      }
      if (url.pathname === '/rest/v1/suno_tasks') return json(null);
      throw new Error(`Unexpected request ${url.pathname}`);
    };
    const req = { method: 'POST', url: '/api/suno/generate', headers: { authorization: 'Bearer test', host: 'localhost' }, body: { customMode: true, prompt: 'lyrics', title: 'Test', style: 'Pop', model: 'V6', personaId: 'voice', personaModel: 'voice_persona' } };
    const res = { statusCode: 0, body: null as any, setHeader() {}, end(value: string) { this.body = JSON.parse(value); } };
    await handler(req, res);
    assert.equal(res.statusCode, outage ? 503 : 200, JSON.stringify(res.body));
    assert.equal(calls.includes('POST /api/v1/generate'), !outage);
    if (outage) assert.equal(res.body.code, 'VOICE_CHECK_FAILED');
  }
});

test('a saved clone is validated even when personaModel is missing from the payload', async (t) => {
  const env = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'https://voice-test.supabase.co', SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', SUNO_API_KEY: 'test', SUNO_API_BASE_URL: 'https://voice-provider.test', ADMIN_EMAILS: 'admin@example.test' });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; process.env = env; });
  const calls: string[] = [];
  globalThis.fetch = async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push(`${init.method || 'GET'} ${url.pathname}`);
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return json({ id: 'owner', email: 'admin@example.test' });
    if (url.pathname === '/rest/v1/suno_voices') return json({ id: 'saved', user_id: 'owner', suno_voice_id: 'voice', last_task_id: 'task', status: 'ready' });
    if (url.pathname === '/api/v1/voice/record-info') return json({ code: 200, data: { status: 'success', voiceId: 'voice' } });
    if (url.pathname === '/api/v1/voice/check-voice') return json({ code: 200, data: { isAvailable: true } });
    if (url.pathname === '/api/v1/generate') {
      const body = JSON.parse(init.body);
      assert.equal(body.personaId, 'voice');
      return json({ code: 200, data: { taskId: 'generated-test-task' } });
    }
    if (url.pathname === '/rest/v1/suno_tasks') return json(null);
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  const req = { method: 'POST', url: '/api/suno/generate', headers: { authorization: 'Bearer test', host: 'localhost' }, body: { customMode: true, prompt: 'lyrics', title: 'Test', style: 'Pop', model: 'V6', personaId: 'voice' } };
  const res = { statusCode: 0, body: null as any, setHeader() {}, end(value: string) { this.body = JSON.parse(value); } };
  await handler(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(calls.includes('GET /api/v1/voice/record-info'), true, 'a saved clone must run record-info even without personaModel');
  assert.equal(calls.includes('POST /api/v1/voice/check-voice'), true, 'a saved clone must run check-voice even without personaModel');
});

test('an ordinary style persona that is not a saved clone is not blocked', async (t) => {
  const env = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'https://voice-test.supabase.co', SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', SUNO_API_KEY: 'test', SUNO_API_BASE_URL: 'https://voice-provider.test', ADMIN_EMAILS: 'admin@example.test' });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; process.env = env; });
  const calls: string[] = [];
  globalThis.fetch = async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push(`${init.method || 'GET'} ${url.pathname}`);
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return json({ id: 'owner', email: 'admin@example.test' });
    if (url.pathname === '/rest/v1/suno_voices') return json(null);
    if (url.pathname === '/api/v1/generate') {
      const body = JSON.parse(init.body);
      assert.equal(body.personaId, 'style-persona');
      assert.equal(body.personaModel, 'persona');
      return json({ code: 200, data: { taskId: 'generated-test-task' } });
    }
    if (url.pathname === '/rest/v1/suno_tasks') return json(null);
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  const req = { method: 'POST', url: '/api/suno/generate', headers: { authorization: 'Bearer test', host: 'localhost' }, body: { customMode: true, prompt: 'lyrics', title: 'Test', style: 'Pop', model: 'V6', personaId: 'style-persona', personaModel: 'persona' } };
  const res = { statusCode: 0, body: null as any, setHeader() {}, end(value: string) { this.body = JSON.parse(value); } };
  await handler(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(calls.includes('GET /api/v1/voice/record-info'), false, 'an ordinary persona must not trigger the clone readiness check');
  assert.equal(calls.includes('POST /api/v1/voice/check-voice'), false, 'an ordinary persona must not trigger the clone readiness check');
});

test('voice-generate 23505 preserves voice-validate and writes extra as a jsonb object', async (t) => {
  const env = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'https://voice-test.supabase.co', SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', SUNO_API_KEY: 'test', SUNO_API_BASE_URL: 'https://voice-provider.test', ADMIN_EMAILS: 'admin@example.test' });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; process.env = env; });

  let patchBody: any = null;
  const existingExtra = JSON.stringify({
    phases: { 'voice-validate': { taskId: 'validate-task-999', callback: '', created_at: '2026-10-08T00:00:00.000Z' } },
    validate_task_id: 'validate-task-999',
  });

  globalThis.fetch = async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method || 'GET';
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return json({ id: 'owner', email: 'admin@example.test' });
    if (url.pathname === '/api/v1/voice/generate') return json({ code: 200, data: { taskId: 'gen-task-123' } });
    if (url.pathname === '/rest/v1/suno_tasks') {
      if (method === 'POST') return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
      if (method === 'GET') return json([{ extra: existingExtra }]);
      if (method === 'PATCH') { patchBody = JSON.parse(init.body); return json(null); }
    }
    throw new Error(`Unexpected request ${method} ${url.pathname}`);
  };

  const req = { method: 'POST', url: '/api/suno/voice-generate', headers: { authorization: 'Bearer test', host: 'localhost' }, body: { taskId: 'validate-task-999', verifyUrl: 'https://verify.test/ok' } };
  const res = { statusCode: 0, body: null as any, setHeader() {}, end(value: string) { this.body = JSON.parse(value); } };
  await handler(req, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.taskId, 'gen-task-123');
  assert.ok(patchBody, 'expected a PATCH to merge the conflict');
  assert.equal(typeof patchBody.extra, 'object', 'extra must be written as a jsonb object, not a string');
  assert.equal(Array.isArray(patchBody.extra), false);
  assert.equal(patchBody.extra.phases['voice-validate'].taskId, 'validate-task-999', 'existing voice-validate phase must be preserved');
  assert.equal(patchBody.extra.phases['voice-generate'].taskId, 'gen-task-123', 'voice-generate phase must be added');
  assert.equal(patchBody.extra.validation_task_id, 'validate-task-999');
  assert.equal(patchBody.extra.create_task_id, 'gen-task-123');
});

test('voice-regenerate 23505 merges phases and writes extra as a jsonb object', async (t) => {
  const env = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'https://voice-test.supabase.co', SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', SUNO_API_KEY: 'test', SUNO_API_BASE_URL: 'https://voice-provider.test', ADMIN_EMAILS: 'admin@example.test' });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; process.env = env; });

  let patchBody: any = null;
  const existingExtra = JSON.stringify({
    phases: { 'voice-validate': { taskId: 'validate-task-999', callback: '', created_at: '2026-10-08T00:00:00.000Z' } },
    validate_task_id: 'validate-task-999',
  });

  globalThis.fetch = async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method || 'GET';
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return json({ id: 'owner', email: 'admin@example.test' });
    if (url.pathname === '/api/v1/voice/regenerate') return json({ code: 200, data: { taskId: 'regen-task-456' } });
    if (url.pathname === '/rest/v1/suno_tasks') {
      if (method === 'POST') return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
      if (method === 'GET') return json([{ extra: existingExtra }]);
      if (method === 'PATCH') { patchBody = JSON.parse(init.body); return json(null); }
    }
    throw new Error(`Unexpected request ${method} ${url.pathname}`);
  };

  const req = { method: 'POST', url: '/api/suno/voice-regenerate', headers: { authorization: 'Bearer test', host: 'localhost' }, body: { taskId: 'validate-task-999' } };
  const res = { statusCode: 0, body: null as any, setHeader() {}, end(value: string) { this.body = JSON.parse(value); } };
  await handler(req, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.taskId, 'regen-task-456');
  assert.ok(patchBody, 'expected a PATCH to merge the conflict');
  assert.equal(typeof patchBody.extra, 'object', 'extra must be written as a jsonb object, not a string');
  assert.equal(patchBody.extra.phases['voice-validate'].taskId, 'validate-task-999', 'existing phase must be preserved');
  assert.equal(patchBody.extra.phases['voice-regenerate'].taskId, 'regen-task-456', 'voice-regenerate phase must be added');
});

test('a selected clone with customMode=false is rejected before charging', async (t) => {
  const env = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'https://voice-test.supabase.co', SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', SUNO_API_KEY: 'test', SUNO_API_BASE_URL: 'https://voice-provider.test', ADMIN_EMAILS: 'admin@example.test' });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; process.env = env; });

  const calls: string[] = [];
  globalThis.fetch = async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push(`${init.method || 'GET'} ${url.pathname}`);
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return json({ id: 'owner', email: 'admin@example.test' });
    if (url.pathname === '/rest/v1/suno_voices') return json({ id: 'saved', user_id: 'owner', suno_voice_id: 'voice', last_task_id: 'task', status: 'ready' });
    throw new Error(`Unexpected request ${url.pathname}`);
  };

  const req = { method: 'POST', url: '/api/suno/generate', headers: { authorization: 'Bearer test', host: 'localhost' }, body: { customMode: false, prompt: 'Test lyrics', personaId: 'voice' } };
  const res = { statusCode: 0, body: null as any, setHeader() {}, end(value: string) { this.body = JSON.parse(value); } };
  await handler(req, res);

  assert.equal(res.statusCode, 400, JSON.stringify(res.body));
  assert.equal(res.body.code, 'VOICE_REQUIRES_CUSTOM_MODE');
  assert.equal(calls.includes('POST /api/v1/generate'), false, 'must not send a generation request without the voice');
  assert.equal(calls.includes('POST /rest/v1/suno_tasks'), false, 'must not insert a task before charging');
});

test('voice-generate returns the create (generate) taskId, not the validate taskId', async (t) => {
  const env = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'https://voice-test.supabase.co', SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', SUNO_API_KEY: 'test', SUNO_API_BASE_URL: 'https://voice-provider.test', ADMIN_EMAILS: 'admin@example.test' });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; process.env = env; });

  let inserted: any = null;
  globalThis.fetch = async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method || 'GET';
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return json({ id: 'owner', email: 'admin@example.test' });
    if (url.pathname === '/api/v1/voice/generate') return json({ code: 200, data: { taskId: 'gen-task-123' } });
    if (url.pathname === '/rest/v1/suno_tasks' && method === 'POST') { inserted = JSON.parse(init.body); return json(null); }
    throw new Error(`Unexpected request ${method} ${url.pathname}`);
  };

  const req = { method: 'POST', url: '/api/suno/voice-generate', headers: { authorization: 'Bearer test', host: 'localhost' }, body: { taskId: 'validate-task-999', verifyUrl: 'https://verify.test/ok' } };
  const res = { statusCode: 0, body: null as any, setHeader() {}, end(value: string) { this.body = JSON.parse(value); } };
  await handler(req, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.taskId, 'gen-task-123', 'the create taskId (used for suno_voices.last_task_id) must come from voice/generate');
  assert.ok(inserted, 'expected the voice task to be persisted');
  assert.equal(inserted.task_id, 'gen-task-123');
  const insertedExtra = typeof inserted.extra === 'string' ? JSON.parse(inserted.extra) : inserted.extra;
  assert.equal(insertedExtra.create_task_id, 'gen-task-123');
  assert.equal(insertedExtra.validation_task_id, 'validate-task-999');
});
