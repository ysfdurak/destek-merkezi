import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { configFromEnv, createApplication } from '../server/main.mjs';

// Caddy arkasındaki demo sunucusu: Host başlığı alan adı, bağlantı düz HTTP.
async function start(t, demo = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'destek-demo-'));
  const app = createApplication({
    profil: 'orta', host: '127.0.0.1', port: 0, baseUrl: 'https://destek.ornek.test', proxy: true,
    database: join(dir, 'destek.sqlite'), yedek: { acik: false },
    demo: { acik: true, klasor: join(dir, 'demo'), saat: 72, enFazla: 3, saatlikIpSiniri: 2, ...demo }
  });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const port = app.server.address().port;
  t.after(async () => { await new Promise(r => app.server.close(r)); rmSync(dir, { recursive: true, force: true }); });
  const call = (path, { body, cookie, ip = '203.0.113.5', host = 'destek.ornek.test', headers = {} } = {}) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = httpRequest({ host: '127.0.0.1', port, path, method: data ? 'POST' : 'GET', headers: {
      host, 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}),
      ...(data ? { 'content-type': 'application/json', origin: 'https://destek.ornek.test' } : {}), ...headers
    } }, res => {
      let text = '';
      res.on('data', c => text += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(data);
  });
  const cookiesOf = res => (res.headers['set-cookie'] ?? []).map(c => c.split(';')[0]).join('; ');
  return { app, dir, call, cookiesOf };
}

test('demo sunucusu: her ziyaretçiye ayrı, örnek verili alan açılır', async t => {
  const { call, cookiesOf, dir } = await start(t);
  assert.equal((await call('/healthz', { host: '127.0.0.1:8080' })).text, 'ok');
  const startup = (await call('/api/startup')).json();
  assert.deepEqual([startup.demo, startup.hasDemo, startup.setup], [true, false, false]);
  assert.equal((await call('/api/state')).status, 401);

  const a = await call('/api/demo', { body: {} });
  assert.equal(a.status, 201);
  const setCookies = a.headers['set-cookie'];
  assert.equal(setCookies.length, 2);
  assert.ok(setCookies.every(c => /HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Strict/.test(c)), 'çerezler Secure olmalı');
  const ca = cookiesOf(a);
  const sa = (await call('/api/state', { cookie: ca })).json();
  assert.equal(sa.state.isDemo, true);
  assert.equal(sa.canTest, true);
  assert.ok(sa.demo && sa.demo.ttlHours === 72);
  assert.equal(sa.mail, undefined);
  assert.ok(sa.state.supports.length > 20, 'örnek geçmiş yüklenmeli');

  // İkinci ziyaretçinin kaydı birincinin alanına düşmez.
  const b = await call('/api/demo', { body: {}, ip: '198.51.100.7' });
  const cb = cookiesOf(b);
  const sb = (await call('/api/state', { cookie: cb })).json();
  const location = { name: 'Yalnızca B', code: 'YB', active: true };
  const saved = await call('/api/state', { cookie: cb, body: { action: 'definition', payload: { kind: 'locations', value: location }, revision: sb.revision } });
  assert.equal(saved.status, 200, saved.text);
  const again = (await call('/api/state', { cookie: ca })).json();
  assert.ok(!again.state.locations.some(l => l.name === 'Yalnızca B'));
  assert.ok((await call('/api/state', { cookie: cb })).json().state.locations.some(l => l.name === 'Yalnızca B'));
  // Başka alanın oturum çerezi bu alanda geçmez.
  const sessionB = cb.split('; ').find(c => c.startsWith('destek_session'));
  const demoA = ca.split('; ').find(c => c.startsWith('destek_demo'));
  assert.equal((await call('/api/state', { cookie: demoA + '; ' + sessionB })).status, 401);

  // Çıkış sonrası aynı alana dönülür; "yeni" ile alan sıfırlanır.
  await call('/api/logout', { cookie: ca, body: {} });
  assert.equal((await call('/api/state', { cookie: ca })).status, 401);
  assert.equal((await call('/api/startup', { cookie: demoA })).json().hasDemo, true);
  const resumed = await call('/api/demo', { cookie: demoA, body: {} });
  assert.equal(resumed.status, 200);
  assert.equal((await call('/api/state', { cookie: demoA + '; ' + cookiesOf(resumed) })).json().revision, again.revision);
  const fresh = await call('/api/demo', { cookie: demoA, body: { yeni: true } });
  assert.equal(fresh.status, 201);
  assert.notEqual(cookiesOf(fresh).split('; ').find(c => c.startsWith('destek_demo')), demoA);
  assert.equal(readdirSync(join(dir, 'demo')).filter(f => f.endsWith('.sqlite')).length, 2, 'sıfırlanan alan silinmeli');

  // Demo sunucusunda giriş, kurulum ve parola kapalı.
  for (const path of ['/api/login', '/api/setup', '/api/password']) assert.equal((await call(path, { body: {} })).status, 403);
  // Yanlış alan adı ve başka kaynaktan POST reddedilir.
  assert.equal((await call('/api/startup', { host: 'kotu.ornek.test' })).status, 421);
  assert.equal((await call('/api/demo', { body: {}, headers: { origin: 'https://kotu.ornek.test' } })).status, 403);
});

test('demo sunucusu: IP sınırı, üst sınır ve süre dolunca silme', async t => {
  const { app, call, cookiesOf, dir } = await start(t);
  assert.equal((await call('/api/demo', { body: {} })).status, 201);
  const second = await call('/api/demo', { body: {} });
  assert.equal(second.status, 201);
  assert.equal((await call('/api/demo', { body: {} })).status, 429, 'aynı IP saatte en fazla 2');
  assert.equal((await call('/api/demo', { body: {}, ip: '198.51.100.9' })).status, 201);
  assert.equal((await call('/api/demo', { body: {}, ip: '198.51.100.10' })).status, 503, 'üst sınır 3');

  const files = readdirSync(join(dir, 'demo')).filter(f => f.endsWith('.sqlite'));
  const old = new Date(Date.now() - 73 * 3600000);
  utimesSync(join(dir, 'demo', files[0]), old, old);
  assert.equal(app.demo.cleanup(Date.now() + 16 * 60000), 1);
  assert.equal(readdirSync(join(dir, 'demo')).filter(f => f.endsWith('.sqlite')).length, 2);
  assert.equal((await call('/api/demo', { body: {}, ip: '198.51.100.11' })).status, 201, 'yer açılınca yeniden açılır');
  // Silinen alanın çerezi artık bir şey açmaz.
  const summary = app.demo.summary();
  assert.equal(summary.active, 3);
  assert.ok(summary.rows.some(r => r.tur === 'olusturma' && r.adet === 4));
  assert.ok(statSync(join(dir, 'demo', 'istatistik.db')).size > 0);
  void cookiesOf(second);
});

test('ortam değişkenlerinden Docker ayarı', () => {
  const config = configFromEnv({ DESTEK_BASE_URL: 'https://destek.ysfdurak.com', DATA_DIR: '/data', DEMO_MODE: 'true', DEMO_TTL_HOURS: '48' });
  assert.equal(config.proxy, true);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 8080);
  assert.equal(config.database, '/data/destek.sqlite');
  assert.deepEqual([config.demo.acik, config.demo.saat, config.demo.klasor], [true, 48, '/data/demo']);
  assert.equal(configFromEnv({ DESTEK_BASE_URL: 'https://x.test' }).demo.acik, false);
  // Vekilsiz düz HTTP ile https adresi kabul edilmez.
  assert.throws(() => createApplication({ baseUrl: 'https://destek.ornek.test', database: ':memory:', yedek: { acik: false } }), /baseUrl/);
});

test('demo giriş sayfası arama ve paylaşım etiketleriyle döner', async t => {
  const { call } = await start(t);
  const page = await call('/');
  assert.equal(page.status, 200);
  assert.match(page.text, /<link rel="canonical" href="https:\/\/destek\.ornek\.test\/">/);
  assert.match(page.text, /<meta property="og:title"/);
});

test('ölçüm servisi yalnız demoda sayfaya eklenir ve CSP yalnız o adrese izin verir', async t => {
  const { call } = await start(t);
  const sayfa = await call('/');
  assert.equal(sayfa.status, 200);
  assert.match(sayfa.text, /<script src="\/olcum\.js"><\/script>\n<script type="module" src="\/app\.js">/);
  const csp = sayfa.headers['content-security-policy'];
  assert.match(csp, /script-src 'self' https:\/\/olcum\.ysfdurak\.com;/);
  assert.match(csp, /connect-src 'self' https:\/\/olcum\.ysfdurak\.com;/);
  const yukleyici = await call('/olcum.js');
  assert.equal(yukleyici.status, 200);
  assert.match(yukleyici.text, /location\.hostname !== 'destek\.ysfdurak\.com'/);

  const { call: kapali } = await start(t, { olcum: false });
  const s2 = await kapali('/');
  assert.doesNotMatch(s2.text, /olcum\.js/);
  assert.doesNotMatch(s2.headers['content-security-policy'], /olcum/);
  assert.equal((await kapali('/olcum.js')).status, 404);
});
