// V1.1 düzeltmelerinin testleri. Her test, incelemede bulunan bir hatanın tekrar etmediğini doğrular.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { seed, applyAction, periodOpen, canDecide, deptOn, issues, mismatches, canWithdraw, counted } from '../lib/domain.mjs';
import { buildRows, guessMapping, guessStatus, toDate, toTime, toHours } from '../lib/import.mjs';
import { openStore } from '../server/store.mjs';
import { backupWorker } from '../server/backup.mjs';
import { createApplication } from '../server/main.mjs';
import { createServer } from 'node:net';
async function freePort() { const probe = createServer().listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = probe.address().port; await new Promise(r => probe.close(r)); return port; }

const now = new Date('2026-11-04T10:00:00Z'); // 13:00 Türkiye saati
const setup = () => { const s = seed('owner', 'owner@example.com', now); return { s, admin: s.users[0], top: s.users[1], sev: s.users[2], mal: s.users[3] }; };
const base = { fromDept: 'TOP', toDept: 'SEV', personIds: ['p2'], breakMinutes: 0 };

test('1 · bitişi gelmemiş destek gerçekleşen olarak girilemez, planlanan olarak girilebilir', () => {
  const { s, top } = setup();
  const p = { ...base, start: '2026-11-12T08:00', end: '2026-11-12T16:00' };
  assert.throws(() => applyAction(s, top, 'support', { ...p, realized: true }, now), /gerçekleşen/);
  applyAction(s, top, 'support', { ...p, realized: false }, now);
  assert.equal(s.supports[0].realized, false);
});

test('2 · geriye dönük giriş gün bazlıdır; haftalık kapanış önceki haftayı kilitler', async () => {
  const { entryFloor } = await import('../lib/domain.mjs');
  const { s, top, admin } = setup();
  // Varsayılan 7 gün: dünkü gece desteği ve geçen haftanın kaydı girilebilir
  applyAction(s, top, 'support', { ...base, personIds: ['p1'], start: '2026-11-03T22:00', end: '2026-11-04T06:00', realized: true }, now);
  assert.equal(periodOpen(s, top, { fromDept: 'TOP', start: '2026-10-28T08:00', end: '2026-10-28T12:00' }, now), true);
  assert.equal(periodOpen(s, top, { fromDept: 'TOP', start: '2026-10-27T08:00', end: '2026-10-27T12:00' }, now), false);
  applyAction(s, admin, 'settings', { days: 7, reminderHours: 24, entryBackDays: 0 }, now);
  assert.equal(periodOpen(s, top, { fromDept: 'TOP', start: '2026-11-03T22:00', end: '2026-11-04T06:00' }, now), false);
  // Haftalık kapanış pazartesi 12:00: 4 Kasım çarşamba → 2 Kasım pazartesiden önceki tarihler kilitli
  applyAction(s, admin, 'settings', { days: 7, reminderHours: 24, entryBackDays: 30, weeklyClose: true, weeklyCloseDay: 1, weeklyCloseHour: 12 }, now);
  assert.equal(entryFloor(s, now), '2026-11-02');
  assert.equal(entryFloor(s, new Date('2026-11-02T08:00:00Z')), '2026-10-26'); // pazartesi 11:00 TR: kapanış henüz olmadı
  assert.equal(entryFloor(s, new Date('2026-11-02T10:00:00Z')), '2026-11-02'); // pazartesi 13:00 TR
});

test('3 · puantaj aktarımı sadece ilgili kayıtların incelemesini sıfırlar ve eski notu saklar', () => {
  const { s, admin, sev, mal } = setup();
  applyAction(s, sev, 'resolve', { id: 'r2', reason: 'Vardiya değişikliği, İK onaylı' }, now);
  applyAction(s, mal, 'resolve', { id: 'r3', reason: 'Kontrol edildi' }, now);
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1005', date: '2026-10-01', status: 'present' }] }, now);
  assert.equal(s.supports.find(r => r.id === 'r2').issueNote, 'Vardiya değişikliği, İK onaylı');
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1002', date: '2026-11-04', status: 'absent' }] }, now);
  const r2 = s.supports.find(r => r.id === 'r2');
  assert.equal(r2.issueResolved, false);
  assert.equal(r2.issueHistory[0].note, 'Vardiya değişikliği, İK onaylı');
  assert.equal(s.supports.find(r => r.id === 'r3').issueResolved, true);
});

test('4 · kaydı düzenleyen kişi onu onaylayamaz', () => {
  const { s, admin } = setup();
  const r = s.supports.find(x => x.id === 'r2');
  applyAction(s, admin, 'support', { ...r, note: 'admin düzenledi' }, now);
  assert.equal(canDecide(admin, s.supports.find(x => x.id === 'r2')), false);
  assert.throws(() => applyAction(s, admin, 'decision', { id: 'r2', status: 'approved' }, now), /son düzenleyen/);
  applyAction(s, s.users[2], 'decision', { id: 'r2', status: 'approved' }, now);
});

test('5 · onaylı kayıt düzenlenince önceki sürüm ve kararı saklanır', () => {
  const { s, top } = setup();
  const r = s.supports.find(x => x.id === 'r0');
  applyAction(s, top, 'support', { ...r, breakMinutes: 30 }, now);
  const n = s.supports.find(x => x.id === 'r0');
  assert.equal(n.status, 'pending');
  assert.equal(n.history.length, 1);
  assert.equal(n.history[0].status, 'approved');
  assert.equal(n.history[0].breakMinutes, 15);
  assert.match(s.events[0].detail, /önceki durum: approved · değişen: mola/);
});

test('6 · bölüm değişikliği tarihli olarak bölüm geçmişine yazılır', () => {
  const { s, admin } = setup();
  const p = s.people.find(x => x.id === 'p6');
  applyAction(s, admin, 'definition', { kind: 'people', value: { ...p, deptId: 'SEV', deptFrom: '2026-11-05' } }, now);
  assert.equal(deptOn(s.people.find(x => x.id === 'p6'), '2026-11-05'), 'SEV');
  assert.equal(deptOn(s.people.find(x => x.id === 'p6'), '2026-11-04'), 'MAL');
});

test('8 · yeni bölüm kullanıcı koduyla açılır', () => {
  const { s, admin } = setup();
  assert.throws(() => applyAction(s, admin, 'definition', { kind: 'departments', value: { name: 'Paketleme', code: '', locationId: 'IST' } }, now), /Kod/);
  applyAction(s, admin, 'definition', { kind: 'departments', value: { name: 'Paketleme', code: 'pak', locationId: 'IST', role: 'manager', email: '', deptIds: [] } }, now);
  assert.equal(s.departments.at(-1).id, 'PAK');
  assert.deepEqual(Object.keys(s.departments.at(-1)).sort(), ['active', 'id', 'locationId', 'name']);
  assert.throws(() => applyAction(s, admin, 'definition', { kind: 'departments', value: { name: 'Başka', code: 'PAK', locationId: 'IST' } }, now), /zaten/);
  assert.throws(() => applyAction(s, admin, 'import', { kind: 'volumes', rows: [{ dept: 'PAK', date: '2026-11-04', type: 'Koli', quantity: 10 }] }, now), /satır/); // işlem adedi aktarımı kaldırıldı
});

test('9 · parametreler tip kontrolünden geçer', () => {
  const { s, admin } = setup();
  assert.throws(() => applyAction(s, admin, 'settings', { days: 7, reminderHours: 24, autoApprove: 'false' }, now), /geçersiz/);
  assert.throws(() => applyAction(s, admin, 'settings', { days: 7, reminderHours: 24, entryBackDays: 99 }, now), /Geriye dönük/);
  applyAction(s, admin, 'settings', { days: 5, reminderHours: 12, entryBackDays: 3, autoApprove: false, hack: 1 }, now);
  assert.equal(s.settings.autoApprove, false);
  assert.equal(s.settings.hack, undefined);
});

test('aktarımda tüm hatalı satırlar satır numarasıyla bildirilir ve hiçbir şey değişmez', () => {
  const { s, admin } = setup();
  const before = structuredClone(s.attendance);
  assert.throws(() => applyAction(s, admin, 'import', { kind: 'attendance', rows: [
    { _row: 2, code: '1001', date: '2026-11-04', status: 'present' },
    { _row: 3, code: '9999', date: '2026-11-04', status: 'present' },
    { _row: 4, code: '1002', date: '2026-02-30', status: 'present' }] }, now),
    e => /2 satırda hata/.test(e.message) && /Satır 3: Bilinmeyen sicil/.test(e.message) && /Satır 4: Tarih/.test(e.message));
  assert.deepEqual(s.attendance, before);
});

test('Excel tarih/saat ve puantaj kodu dönüşümü', () => {
  assert.equal(toDate(46330), '2026-11-04');
  assert.equal(toDate('04.11.2026'), '2026-11-04');
  assert.equal(toDate('4/11/26'), '2026-11-04');
  assert.equal(toDate('2026-02-30'), '');
  assert.deepEqual(toTime(0.3125), { time: '07:30', date: null });
  assert.equal(toTime('7:30').time, '07:30');
  assert.equal(guessStatus('İzinli'), 'absent');
  assert.equal(guessStatus('Geldi'), 'present');
  assert.equal(guessStatus('Hafta Tatili'), 'absent');
  assert.equal(guessStatus('belirsiz'), '');
  const records = [
    { 'Sicil No': '1001', 'Tarih': 46330, 'Puantaj Kodu': 'Geldi', 'Giriş': 0.3125, 'Çıkış': 0.7708333 },
    { 'Sicil No': '1003', 'Tarih': '04.11.2026', 'Puantaj Kodu': 'N', 'Giriş': '22:00', 'Çıkış': '06:00' },
    { 'Sicil No': '1004', 'Tarih': '04.11.2026', 'Puantaj Kodu': 'Özel', 'Giriş': '', 'Çıkış': '' }
  ];
  const mapping = guessMapping(Object.keys(records[0]), 'attendance');
  assert.deepEqual(mapping, { code: 'Sicil No', date: 'Tarih', status: 'Puantaj Kodu', start: 'Giriş', end: 'Çıkış', shift: '', hours: '' });
  let out = buildRows(records, mapping, 'attendance');
  assert.equal(out.rows[0].end, '2026-11-04T18:30');
  assert.equal(out.rows[1].end, '2026-11-05T06:00');
  assert.match(out.errors[0], /Satır 4: Durum kodu eşleştirilmedi/);
  out = buildRows(records, mapping, 'attendance', { 'özel': 'skip' });
  assert.equal(out.errors.length, 0);
  assert.equal(out.skipped, 1);
});

test('dönüştürülen gece vardiyası puantajı destek kontrolünde doğru çalışır', () => {
  const { s, admin } = setup();
  const { rows } = buildRows([{ s: '1001', d: '03.11.2026', k: 'Geldi', g: '21:30', c: '06:30' }], { code: 's', date: 'd', status: 'k', start: 'g', end: 'c' }, 'attendance');
  applyAction(s, admin, 'import', { kind: 'attendance', rows }, now);
  const r = { personIds: ['p1'], start: '2026-11-03T22:00', end: '2026-11-04T06:00' };
  assert.deepEqual(issues(s, r), []);
});

test('yedek saatinden önce alınmaz; sonra bir kez alınır ve en fazla keep kadar saklanır', () => {
  const dir = mkdtempSync(join(tmpdir(), 'destek-yedek-'));
  const store = openStore(':memory:');
  store.initialize('owner', seed('owner', 'a@example.com', now), 'x');
  const worker = backupWorker(store, { dir, keep: 2, hour: 2 });
  assert.equal(worker.run(new Date('2026-11-03T22:30:00Z')), false); // 4 Kasım 01:30 TR
  assert.equal(worker.run(new Date('2026-11-03T23:30:00Z')), true);  // 4 Kasım 02:30 TR
  assert.equal(worker.run(new Date('2026-11-04T05:00:00Z')), false); // aynı gün ikinci kez yok
  worker.run(new Date('2026-11-05T05:00:00Z'));
  worker.run(new Date('2026-11-06T05:00:00Z'));
  assert.deepEqual(readdirSync(dir).sort(), ['destek-2026-11-05.sqlite', 'destek-2026-11-06.sqlite']);
  const copy = openStore(join(dir, 'destek-2026-11-06.sqlite'));
  assert.equal(copy.read().state.supports.length, 7);
  copy.db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('profil: küçük işletme yerel ağda HTTP ile başlar (başka cihaz girişi https.test.mjs), orta profil HTTPS ister', () => {
  const dir = mkdtempSync(join(tmpdir(), 'destek-profil-'));
  assert.throws(() => createApplication({ profil: 'orta', host: '0.0.0.0', baseUrl: 'http://192.168.1.20:8732', database: join(dir, 'a.sqlite'), yedek: { acik: false } }), /TLS/);
  const app = createApplication({ profil: 'kucuk', host: '0.0.0.0', baseUrl: 'http://192.168.1.20:8732', database: join(dir, 'b.sqlite'), yedek: { acik: false } });
  assert.equal(app.lanHttp, true);
  app.store.db.close();
  assert.throws(() => createApplication({ profil: 'dev', database: join(dir, 'c.sqlite') }), /profil/);
  rmSync(dir, { recursive: true, force: true });
});

test('kullanıcı kendi parolasını değiştirir; hatalı denemeler hesabı geçici kilitler', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'destek-parola-'));
  const port = await freePort();
  const app = createApplication({ port, database: join(dir, 'p.sqlite'), yedek: { acik: false } });
  app.server.listen(port, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = app.baseUrl.origin;
  t.after(async () => { await new Promise(r => app.server.close(r)); app.store.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const post = (path, body, cookie) => fetch('http://127.0.0.1:' + port + path, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const setup = await post('/api/setup', { name: 'Yönetici', email: 'admin@example.com', password: 'Ilk-Parola-123456', demo: false });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/password', { current: 'yanlis-parola-xx', next: 'Yeni-Parola-123456' }, cookie)).status, 400);
  const ok = await post('/api/password', { current: 'Ilk-Parola-123456', next: 'Yeni-Parola-123456' }, cookie);
  assert.equal(ok.status, 200);
  assert.equal((await post('/api/login', { email: 'admin@example.com', password: 'Ilk-Parola-123456' })).status, 401);
  assert.equal((await post('/api/login', { email: 'admin@example.com', password: 'Yeni-Parola-123456' })).status, 200);
  for (let i = 0; i < 5; i++) await post('/api/login', { email: 'admin@example.com', password: 'yanlis-parola-xx' });
  assert.equal((await post('/api/login', { email: 'admin@example.com', password: 'Yeni-Parola-123456' })).status, 429);
});

test('puantaj saatlerinde noktalı virgül (07;30) ve çalışma süresi okunur', () => {
  assert.equal(toTime('07;30').time, '07:30');
  assert.equal(toHours('03:30'), 3.5);
  assert.equal(toHours('07;30'), 7.5);
  assert.equal(toHours('7,5'), 7.5);
  assert.equal(toHours(0.3125), 7.5);   // Excel süre hücresi
  assert.equal(toHours(''), null);
  assert.equal(toHours('7;75'), undefined);
  assert.equal(toHours('30:00'), undefined);
  const recs = [{ Sicil: '1001', Tarih: '04.11.2026', Durum: 'Geldi', Giriş: '07;30', Çıkış: '18;30', 'Çalışma süresi': '10;00' },
    { Sicil: '1002', Tarih: '04.11.2026', Durum: 'Geldi', Giriş: '', Çıkış: '', 'Çalışma süresi': '03:30' }];
  const map = guessMapping(Object.keys(recs[0]), 'attendance');
  assert.equal(map.hours, 'Çalışma süresi');
  const { rows, errors } = buildRows(recs, map, 'attendance');
  assert.deepEqual(errors, []);
  assert.equal(rows[0].start, '2026-11-04T07:30');
  assert.equal(rows[0].hours, 10);
  assert.equal(rows[1].hours, 3.5);
});

test('çalışma süresini aşan günlük destek uyuşmazlık olarak görünür', () => {
  const { s, admin, top } = setup();
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1001', date: '2026-11-04', status: 'present', hours: 3.5 }] }, now);
  // 3:30 çalışmış kişiye 7:30 destek
  const r = { id: 'yeni', personIds: ['p1'], start: '2026-11-04T00:30', end: '2026-11-04T08:00', breakMinutes: 0, status: 'pending' };
  const found = issues(s, r).find(i => i.code === 'exceeds');
  // Aynı gün zaten 3:45'lik onaylı destek (r0) var: toplam 7:30 + 3:45 = 11:15
  assert.match(found.message, /11:15 sa.*3:30 sa/);
  // Mevcut onaylı 3:45'lik r0 kaydı tek başına 3:30'u da aşar; aynı gündeki destekler toplanır
  assert.ok(issues(s, s.supports.find(x => x.id === 'r0')).some(i => i.code === 'exceeds'));
  // Süre içinde kalan destek uyuşmazlık değildir
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1001', date: '2026-11-04', status: 'present', hours: 8 }] }, now);
  assert.ok(!issues(s, s.supports.find(x => x.id === 'r0')).some(i => i.code === 'exceeds'));
  // Reddedilen destekler toplama girmez; uyuşmazlıkta otomatik onay bekler, engelleme açıksa giriş reddedilir
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1001', date: '2026-11-04', status: 'present', hours: 4 }] }, now);
  applyAction(s, admin, 'settings', { days: 7, reminderHours: 24, blockIssues: true }, now);
  // Aynı kişiye aynı gün ikinci kayıt zaten engellenir (Ece'nin 4 Kasım'da r0 kaydı var)
  assert.throws(() => applyAction(s, top, 'support', { fromDept: 'TOP', toDept: 'MAL', personIds: ['p1'], start: '2026-11-04T05:00', end: '2026-11-04T07:00', breakMinutes: 0, realized: true }, now), /zaten destek kaydı var \(DST-0001\)/);
  // Uyuşmazlık engeli: işe gelmediği gün (Mert) için yeni kayıt reddedilir
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1002', date: '2026-11-03', status: 'absent' }] }, now);
  assert.throws(() => applyAction(s, top, 'support', { fromDept: 'TOP', toDept: 'MAL', personIds: ['p2'], start: '2026-11-03T05:00', end: '2026-11-03T07:00', breakMinutes: 0, realized: true }, now), /uyuşmazlığı/);
  assert.throws(() => applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1001', date: '2026-11-04', status: 'present', start: '2026-11-04T08:00', end: '2026-11-04T10:00', hours: 5 }] }, now), /aralığından uzun/);
});

test('işe gelmeyen kişiye girilen destek uyumsuz destektir; eksik puantaj değildir', () => {
  const { s } = setup();
  assert.equal(mismatches(s, s.supports.find(r => r.id === 'r2'))[0].code, 'absent'); // Mert Kaya o gün gelmedi
  s.attendance = s.attendance.filter(a => a.personId !== 'p2');
  assert.equal(mismatches(s, s.supports.find(r => r.id === 'r2')).length, 0);       // satır yok = veri uyarısı
});

test('destek veren bölüm kaydı geri çekebilir; kayıt silinmez, hesaba ve çakışmaya girmez', () => {
  const { s, top, sev } = setup();
  assert.equal(canWithdraw(sev, s.supports.find(r => r.id === 'r2')), false); // karşı bölüm geri çekemez
  assert.throws(() => applyAction(s, sev, 'cancel', { id: 'r2', kind: 'withdraw' }, now), /destek veren bölüm/);
  applyAction(s, top, 'cancel', { id: 'r2', kind: 'withdraw' }, now);       // bekleyen kayıt: gerekçe isteğe bağlı
  const r2 = s.supports.find(r => r.id === 'r2');
  assert.equal(r2.status, 'cancelled');
  assert.equal(r2.cancelledFrom, 'pending');
  assert.equal(s.supports.length, 7);
  assert.throws(() => applyAction(s, top, 'cancel', { id: 'r2', kind: 'withdraw' }, now), /zaten/);
  // Aynı kişiye aynı saatlere yeni kayıt artık girilebilir
  applyAction(s, top, 'support', { fromDept: 'TOP', toDept: 'MAL', personIds: ['p2'], start: r2.start, end: r2.end, breakMinutes: 0, realized: false }, now);
});

test('onaylı destek gerekçeyle geri çekilir ve onaylı adam-saatten düşer; sonra yeniden gönderilebilir', () => {
  const { s, top } = setup();
  const r0 = () => s.supports.find(r => r.id === 'r0');
  assert.equal(counted(s, r0()), true);
  assert.throws(() => applyAction(s, top, 'cancel', { id: 'r0', kind: 'withdraw', reason: '' }, now), /gerekçe/);
  applyAction(s, top, 'cancel', { id: 'r0', kind: 'withdraw', reason: 'Yanlış personel girildi' }, now);
  assert.equal(counted(s, r0()), false);
  assert.match(s.events[0].detail, /önceki durum: approved · Yanlış personel girildi/);
  applyAction(s, top, 'support', { ...r0(), personIds: ['p1'], note: 'Düzeltildi' }, now);
  assert.equal(r0().status, 'pending');
  assert.equal(r0().history.at(-1).status, 'cancelled');
  assert.equal(r0().history.at(-1).cancelReason, 'Yanlış personel girildi');
});

test('uyumsuz destek iki bölümden biri tarafından gerekçeyle iptal edilir; uyumsuzluk yoksa iptal edilemez', () => {
  const { s, top, sev, mal } = setup();
  assert.throws(() => applyAction(s, sev, 'cancel', { id: 'r0', kind: 'mismatch', reason: 'x' }, now), /uyuşmazlığı yok/);
  assert.throws(() => applyAction(s, mal, 'cancel', { id: 'r2', kind: 'mismatch', reason: 'x' }, now), /yetkiniz yok/);
  assert.throws(() => applyAction(s, sev, 'cancel', { id: 'r2', kind: 'mismatch', reason: '' }, now), /gerekçe/);
  applyAction(s, sev, 'cancel', { id: 'r2', kind: 'mismatch', reason: 'Personel o gün raporlu' }, now); // karşı bölüm
  assert.equal(s.supports.find(r => r.id === 'r2').cancelKind, 'mismatch');
  assert.equal(canDecide(sev, s.supports.find(r => r.id === 'r2')), false);
});

test('kapalı dönemde yalnızca yönetici geri çekebilir', () => {
  const { s, top, admin } = setup();
  s.settings.entryBackDays = 1;
  const later = new Date('2026-11-06T10:00:00Z');
  assert.throws(() => applyAction(s, top, 'cancel', { id: 'r2', kind: 'withdraw' }, later), /dönemi kapalı/);
  applyAction(s, admin, 'cancel', { id: 'r2', kind: 'withdraw', reason: 'Yönetici düzeltmesi' }, later);
});

test('dashboard: dönemler, kayıt sınıfları, kişi sayısı ve matris (saat hesabı yok)', async () => {
  const { dashboard, periods } = await import('../lib/dashboard.mjs');
  const { sampleHistory } = await import('../lib/domain.mjs');
  assert.deepEqual(periods('2026-10-28', '2026-11-10', 'week').map(p => [p.from, p.to]), [['2026-10-28', '2026-11-01'], ['2026-11-02', '2026-11-08'], ['2026-11-09', '2026-11-10']]);
  const late = new Date('2026-11-04T16:00:00Z');
  const s = seed('o', 'o@example.com', late);
  const d = dashboard(s, { from: '2026-11-04', to: '2026-11-04' });
  assert.deepEqual(d.count, { final: 2, pending: 4, planned: 0, rejected: 1, cancelled: 0 });
  assert.equal(d.kpi.people, 2);               // r0: Ece, r1: Can
  assert.equal(d.matrix.MAL.TOP, 1);
  assert.equal(d.kpi.rejectRate, 1 / 3);
  assert.equal(d.mismatch.count, 1);
  assert.equal(JSON.stringify(d).includes('hours'), false);
  assert.equal(dashboard(s, { from: '2026-11-04', to: '2026-11-04', deptIds: ['STK'] }).kpi.final, 0);
  const a = sampleHistory(seed('o', 'o@example.com', late), late), b = sampleHistory(seed('o', 'o@example.com', late), late);
  assert.equal(JSON.stringify(a.supports), JSON.stringify(b.supports));
  assert.equal(new Set(a.supports.map(r => r.code)).size, a.supports.length);
  assert.equal(a.volumes.length, 0);
});

test('toplu giriş: hepsi ya da hiçbiri; satır numarasıyla hata; aynı kişi aynı gün engellenir', () => {
  const { s, top } = setup();
  const before = s.supports.length;
  const item = (row, person, date, shiftId = 'A') => ({ _row: row, fromDept: 'TOP', toDept: 'MAL', personIds: [person], date, shiftId, realized: true });
  assert.throws(() => applyAction(s, top, 'supportBatch', { items: [item(1, 'p1', '2026-11-02'), item(2, 'p3', '2026-11-02')] }, now),
    e => /1 kayıtta hata/.test(e.message) && /Satır 2:/.test(e.message));
  assert.equal(s.supports.length, before);
  // Kişiler sabit, üç gün: 1, 2, 3 Kasım
  applyAction(s, top, 'supportBatch', { items: ['2026-11-01', '2026-11-02', '2026-11-03'].map((d, i) => ({ ...item(i + 1, 'p1', d), personIds: ['p1', 'p2'] })) }, now);
  assert.equal(s.supports.length, before + 3);
  assert.equal(new Set(s.supports.map(r => r.code)).size, s.supports.length);
  assert.equal(s.supports[0].requestChannel, undefined);
  // Aynı gün tekrar giriş engellenir (vardiya farklı olsa da)
  assert.throws(() => applyAction(s, top, 'supportBatch', { items: [item(1, 'p1', '2026-11-03', 'B')] }, now), /zaten destek kaydı var/);
});

test('vardiya: A/B/C sabit saat ve mola; puantajda farklı vardiya uyumsuzluğu', async () => {
  const { netHours, shiftTimes } = await import('../lib/domain.mjs');
  const { s, admin, top } = setup();
  assert.deepEqual(s.shifts.map(x => x.id), ['A', 'B', 'C']);
  // 8:30 vardiya, 30 dk yemek + 30 dk çay = 7:30 destek
  assert.deepEqual(shiftTimes(s.shifts[0], '2026-11-03'), { start: '2026-11-03T07:00', end: '2026-11-03T15:30', breakMinutes: 60 });
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1001', date: '2026-11-03', status: 'present', shift: 'B' }] }, now);
  // İstemci farklı saat gönderse de vardiya saatleri uygulanır
  applyAction(s, top, 'support', { ...base, personIds: ['p1'], start: '2026-11-03T09:00', end: '2026-11-03T10:00', breakMinutes: 0, realized: true, shiftId: 'A' }, now);
  const r = s.supports[0];
  assert.equal(r.start, '2026-11-03T07:00');
  assert.equal(r.breakMinutes, 60);
  assert.equal(netHours(r), 7.5);
  assert.equal(mismatches(s, r).find(i => i.code === 'shift').code, 'shift');
  // C vardiyası gece yarısını geçer, başladığı güne aittir
  assert.deepEqual(shiftTimes(s.shifts[2], '2026-11-03'), { start: '2026-11-03T23:30', end: '2026-11-04T08:00', breakMinutes: 60 });
  applyAction(s, admin, 'definition', { kind: 'shifts', value: { name: 'D', code: 'd', start: '10:00', end: '18:30', mealMinutes: 45, teaMinutes: 15, locationId: 'BUR' } }, now);
  assert.equal(s.shifts.at(-1).id, 'D');
  assert.throws(() => applyAction(s, admin, 'definition', { kind: 'shifts', value: { name: 'E', code: 'e', start: '10:00', end: '11:00', mealMinutes: 45, teaMinutes: 15 } }, now), /Molalar/);
  assert.throws(() => applyAction(s, top, 'support', { ...base, personIds: ['p2'], date: '2026-11-02', start: '2026-11-02T10:00', end: '2026-11-02T12:00', realized: true, shiftId: 'D' }, now), /Vardiya/); // TOP İstanbul'da
  assert.throws(() => applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1001', date: '2026-11-03', status: 'present', shift: 'Öğle' }] }, now), /Bilinmeyen vardiya/);
});

test('rapor merkezi: altı rapor, vardiya filtresi, analizler', async () => {
  const { REPORTS, buildReport, buildAll, SHEET_NAMES } = await import('../lib/reports.mjs');
  const { analytics } = await import('../lib/dashboard.mjs');
  const { sampleHistory } = await import('../lib/domain.mjs');
  const late = new Date('2026-11-12T16:00:00Z');
  const s = sampleHistory(seed('o', 'o@example.com', late), late);
  const f = { from: '2026-10-16', to: '2026-11-12' };
  const all = buildAll(s, f);
  assert.equal(all.length, REPORTS.length);
  for (const r of all) for (const sec of r.sections) {
    assert.ok(sec.sheet, 'sayfa adı yok: ' + sec.title);
    assert.ok(sec.sheet.length <= 31);
    for (const row of sec.rows) assert.equal(row.length, sec.columns.length, sec.title);
  }
  const night = buildReport('liste', s, { ...f, shiftId: 'C' });
  assert.ok(night.sections[0].rows.length > 0);
  assert.ok(night.sections[0].rows.every(r => r[3] === 'C'));
  const a = analytics(s, f);
  assert.equal(a.delay.buckets.reduce((x, b) => x + b.count, 0), a.delay.count);
  assert.equal(a.heat.days.length, 28);
  assert.ok(a.persons[0].count >= a.persons.at(-1).count);
});

test('hiyerarşi: düzey adları, birimler, toplama ve filtre', async () => {
  const { levels, ancestorAt, deptsUnder, rollup, pathNames, plural } = await import('../lib/org.mjs');
  const { buildReport } = await import('../lib/reports.mjs');
  const { dashboard } = await import('../lib/dashboard.mjs');
  const { s, admin } = setup();
  assert.deepEqual(levels(s), ['Bölüm', 'Müdürlük', 'Direktörlük']);
  assert.equal(plural('Takım'), 'Takımlar'); assert.equal(plural('Müdürlük'), 'Müdürlükler');
  assert.equal(ancestorAt(s, 'TOP', 2), 'CIK');
  assert.equal(ancestorAt(s, 'MAL', 3), 'LOJ');
  assert.deepEqual(deptsUnder(s, 2, ['GIR']).sort(), ['MAL', 'STK']);
  assert.deepEqual(pathNames(s, 'SEV'), { 2: 'Çıkış Operasyonları Müdürlüğü', 3: 'Lojistik Direktörlüğü' });
  // Müdürlük düzeyinde: MAL→TOP desteği GIR→CIK olur; TOP→SEV aynı müdürlük içinde kalır
  const r = rollup(s, 2);
  assert.deepEqual(r.departments.map(d => d.id).sort(), ['CIK', 'GIR']);
  const d = dashboard(r, { from: '2026-11-04', to: '2026-11-04' });
  assert.equal(d.matrix.GIR.CIK, 1);
  assert.equal(d.matrix.CIK.CIK, 1);
  // Raporda düzey adı ve üst birim sütunları
  const rep = buildReport('bolum', s, { from: '2026-11-04', to: '2026-11-04', groupLevel: 2 });
  assert.equal(rep.title, 'Müdürlük raporu');
  assert.equal(rep.sections[0].columns[0], 'Müdürlük');
  const list = buildReport('liste', s, { from: '2026-11-04', to: '2026-11-04' });
  assert.ok(list.sections[0].columns.includes('Veren müdürlük') && list.sections[0].columns.includes('Alan direktörlük'));
  // Kullanıcı düzeyleri kendisi belirler: Takım → Bölüm → Müdürlük
  applyAction(s, admin, 'orgLevels', { levels: ['Takım', 'Bölüm', 'Müdürlük'] }, now);
  assert.equal(buildReport('bolum', s, { from: '2026-11-04', to: '2026-11-04', groupLevel: 3 }).sections[0].columns[0], 'Müdürlük');
  // Dört düzey ve yeni birim
  applyAction(s, admin, 'orgLevels', { levels: ['Takım', 'Bölüm', 'Müdürlük', 'Direktörlük'] }, now);
  applyAction(s, admin, 'definition', { kind: 'orgUnits', value: { name: 'Operasyon Direktörlüğü', code: 'OPD', level: 4 } }, now);
  applyAction(s, admin, 'definition', { kind: 'orgUnits', value: { ...s.orgUnits.find(u => u.id === 'LOJ'), parentId: 'OPD' } }, now);
  assert.equal(ancestorAt(s, 'TOP', 4), 'OPD');
  assert.throws(() => applyAction(s, admin, 'definition', { kind: 'orgUnits', value: { name: 'Yanlış', code: 'YAN', level: 2, parentId: 'OPD' } }, now), /bir üst düzeyden/);
  assert.throws(() => applyAction(s, admin, 'definition', { kind: 'orgUnits', value: { name: 'Aynı kod', code: 'TOP', level: 2 } }, now), /hiyerarşide başka/);
  assert.throws(() => applyAction(s, admin, 'orgLevels', { levels: ['Takım', 'Bölüm'] }, now), /Kaldırılan düzeyde/);
  assert.throws(() => applyAction(s, admin, 'deleteOrgUnit', { id: 'OPD' }, now), /bağlı alt birimler/);
  // Üst birimi olmayan bölüm "Atanmamış" grubuna düşer
  applyAction(s, admin, 'definition', { kind: 'departments', value: { name: 'Paketleme', code: 'PAK', locationId: 'IST' } }, now);
  assert.ok(rollup(s, 2).departments.some(d => d.name === 'Atanmamış'));
});

test('D13: geçersiz yedek ayarı reddedilir (saklanacak 0 yeni yedeği de siliyordu)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'destek-yedek-ayar-'));
  try {
    const store = { db: { prepare: () => ({ get: () => ({}) }) }, backup() {} };
    for (const keep of [0, -1, 1.5, NaN]) assert.throws(() => backupWorker(store, { dir, keep, hour: 2 }), /saklanacak/);
    for (const hour of [24, -1, NaN]) assert.throws(() => backupWorker(store, { dir, keep: 3, hour }), /saat/);
    assert.doesNotThrow(() => backupWorker(store, { dir, keep: 0, hour: 2, enabled: false }));
    assert.doesNotThrow(() => backupWorker(store, { dir, keep: 1, hour: 0 }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
