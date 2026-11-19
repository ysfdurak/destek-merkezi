// Başka cihazdan giriş HTTPS ister (G2). Kabul ölçütü:
// - HTTPS'siz ağ kurulumunda başka bir cihaz oturum açamaz, oturum çerezi de işe yaramaz;
// - aynı bilgisayarda deneme kolaylığı sürer;
// - HTTPS ile (Windows'ta dışa aktarılan .pfx) yetkili kullanıcı normal işini tamamlar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { createApplication, HTTPS_REQUIRED } from '../server/main.mjs';

const here = dirname(fileURLToPath(import.meta.url));
async function freePort() { const probe = createServer().listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = probe.address().port; await new Promise(r => probe.close(r)); return port; }

// Host başlığı ayarlanabilsin ve kendinden imzalı sertifika kabul edilsin diye fetch yerine http(s).request.
function call(secure, port, method, path, body, cookie) {
  const data = body ? JSON.stringify(body) : undefined;
  const origin = (secure ? 'https' : 'http') + '://127.0.0.1:' + port;
  return new Promise((resolve, reject) => {
    const req = (secure ? httpsRequest : httpRequest)({
      host: '127.0.0.1', port, method, path, rejectUnauthorized: false,
      headers: { host: '127.0.0.1:' + port, origin, ...(data ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    }, res => {
      let text = '';
      res.on('data', c => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0]?.split(';')[0], json: text.startsWith('{') ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

async function start(t, config, remote) {
  const dir = mkdtempSync(join(tmpdir(), 'destek-https-'));
  const port = await freePort();
  const state = { remote };
  const app = createApplication({ port, database: join(dir, 'd.sqlite'), yedek: { acik: false }, ...config(port) },
    { ownAddress: () => !state.remote });
  app.server.listen(port, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(async () => { await new Promise(r => app.server.close(r)); app.store.db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { port, state, app };
}
const admin = { name: 'Yönetici', email: 'admin@example.com', password: 'Ilk-Parola-123456', demo: true };
const login = { email: admin.email, password: admin.password };

test('HTTPS yokken: aynı bilgisayar çalışır, başka cihaz giriş yapamaz ve çerezle de erişemez', async t => {
  const { port, state, app } = await start(t, port => ({ profil: 'kucuk', host: '0.0.0.0', baseUrl: 'http://127.0.0.1:' + port }), false);
  assert.equal(app.lanHttp, true);
  // Aynı bilgisayar: kurulum, giriş ve işlem.
  assert.equal((await call(false, port, 'POST', '/api/setup', admin)).status, 201);
  const own = await call(false, port, 'POST', '/api/login', login);
  assert.equal(own.status, 200);
  assert.equal((await call(false, port, 'GET', '/api/state', null, own.cookie)).status, 200);
  // Başka cihaz (telefon, ikinci bilgisayar).
  state.remote = true;
  const startup = await call(false, port, 'GET', '/api/startup');
  assert.equal(startup.json.httpsRequired, true, 'giriş ekranı HTTPS gerektiğini söyler');
  const remote = await call(false, port, 'POST', '/api/login', login);
  assert.equal(remote.status, 403);
  assert.equal(remote.json.error, HTTPS_REQUIRED);
  assert.equal(remote.cookie, undefined, 'oturum çerezi verilmez');
  assert.equal((await call(false, port, 'GET', '/api/state', null, own.cookie)).status, 403, 'ele geçen çerez de işe yaramaz');
  assert.equal((await call(false, port, 'POST', '/api/state', { action: 'x' }, own.cookie)).status, 403);
});

test('HTTPS (.pfx) ile başka cihazdaki yetkili kullanıcı giriş yapar ve işini tamamlar', async t => {
  const pfx = join(here, 'fixtures', 'test-sertifika.pfx');
  const { port } = await start(t, port => ({ profil: 'kucuk', host: '0.0.0.0', baseUrl: 'https://127.0.0.1:' + port, tls: { pfx, parola: 'test-parola' } }), true);
  assert.equal((await call(true, port, 'POST', '/api/setup', admin)).status, 201);
  const remote = await call(true, port, 'POST', '/api/login', login);
  assert.equal(remote.status, 200);
  const state = await call(true, port, 'GET', '/api/state', null, remote.cookie);
  assert.equal(state.status, 200);
  assert.ok(state.json.state.supports.length > 0, 'örnek kayıtlar okunur');
});

test('orta ve kurumsal profil ağa HTTPS olmadan hiç açılmaz', () => {
  const dir = mkdtempSync(join(tmpdir(), 'destek-https-'));
  for (const profil of ['orta', 'kurumsal'])
    assert.throws(() => createApplication({ profil, host: '0.0.0.0', baseUrl: 'http://192.168.1.20:8732', database: join(dir, profil + '.sqlite'), yedek: { acik: false } }), /TLS/);
  rmSync(dir, { recursive: true, force: true });
});
