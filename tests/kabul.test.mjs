// Uçtan uca kabul testi (dış inceleme, Kasım 2026): tek bir destek kaydı gece yarısını geçen vardiyada girilir,
// reddedilir, düzeltilip yeniden gönderilir, puantajla çelişir, puantaj sonradan düzeltilir ve onaylanır.
// Her adımda operasyon raporları (dönem özeti, birim raporu, uyumsuz destek) ile İK tarafının baktığı raporlar
// (personel raporu, kayıt listesi) aynı sayıyı vermelidir. Program adam-saat hesaplamaz (karar: 11 Kasım 2026);
// karşılaştırılan ölçü kayıt, kişi ve gün sayısıdır. Net süre yalnız kayıt listesinde bilgi olarak yazılır.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, applyAction, runRules, counted, mismatches } from '../lib/domain.mjs';
import { buildReport } from '../lib/reports.mjs';

const T = iso => new Date(iso);
const FILTER = { from: '2026-11-01', to: '2026-11-07', shiftId: 'all', groupLevel: 1 };

function setup() {
  const s = seed('owner', 'owner@example.com', T('2026-11-04T10:00:00Z'));
  s.supports = []; s.attendance = []; s.events = []; s.notifications = [];
  const user = id => s.users.find(u => u.id === id);
  return { s, admin: s.users[0], top: user('u-top'), mal: user('u-mal') };
}

const section = (rep, title) => rep.sections.find(x => x.title === title);
const value = (rep, label) => section(rep, 'Özet').rows.find(r => r[0] === label)?.[1];

// Operasyon ve İK raporlarının aynı kaydı aynı sayıyla gösterdiğini tek yerde denetler.
function snapshot(s) {
  const ozet = buildReport('ozet', s, FILTER);
  const bolum = buildReport('bolum', s, FILTER);
  const personel = buildReport('personel', s, FILTER);
  const uyumsuz = buildReport('uyumsuz', s, FILTER);
  const liste = buildReport('liste', s, FILTER);
  const dept = id => section(bolum, 'Bölüm bazında destek').rows.find(r => r[0] === s.departments.find(d => d.id === id).name) ?? [];
  const p1 = section(personel, 'Personel bazında kesinleşen destek').rows.find(r => r[1] === '1001');
  const rows = section(liste, 'Destek kayıtları').rows;
  return {
    final: value(ozet, 'Kesinleşen (onaylı ve gerçekleşen)'),
    pending: value(ozet, 'Onay bekleyen'),
    rejected: value(ozet, 'Reddedilen'),
    mismatch: value(ozet, 'Uyumsuz destek (açık / toplam)'),
    givenTOP: dept('TOP')[1] ?? 0,
    receivedMAL: dept('MAL')[2] ?? 0,
    personCount: p1?.[3] ?? 0,
    personDays: p1?.[4] ?? 0,
    days: section(ozet, 'Güne göre').rows.map(r => r[0]),
    openMismatch: section(uyumsuz, 'Kayıtlar').rows.filter(r => String(r[7]).startsWith('Açık')).length,
    list: rows.map(r => ({ code: r[0], start: r[1], end: r[2], net: r.at(-7), status: r.at(-5), cls: r.at(-4) }))
  };
}

test('kabul: gece yarısını geçen destek · ret · düzeltme · puantaj uyumsuzluğu · puantaj düzeltmesi · onay', () => {
  const { s, admin, top, mal } = setup();

  // 1) Toplama, Mal Kabul'e 2 Kasım için yanlışlıkla B vardiyası (15:30–00:00) girer.
  applyAction(s, top, 'support', { fromDept: 'TOP', toDept: 'MAL', personIds: ['p1'], shiftId: 'B', date: '2026-11-02', realized: true, note: 'Gece mal kabul dalgası' }, T('2026-11-03T09:00:00Z'));
  const id = s.supports[0].id;
  let x = snapshot(s);
  assert.deepEqual([x.final, x.pending, x.rejected], [0, 1, 0]);

  // 2) Mal Kabul gerekçeyle reddeder. Reddedilen kayıt silinmez, hiçbir raporda kesinleşen sayılmaz.
  applyAction(s, mal, 'decision', { id, status: 'rejected', reason: 'Vardiya yanlış: destek C vardiyasında verildi.' }, T('2026-11-03T10:00:00Z'));
  x = snapshot(s);
  assert.deepEqual([x.final, x.pending, x.rejected, x.givenTOP, x.receivedMAL, x.personCount], [0, 0, 1, 0, 0, 0]);
  assert.equal(x.list[0].status, 'Reddedildi');

  // 3) Toplama aynı kaydı C vardiyasına (23:30 → ertesi gün 08:00) düzeltip yeniden gönderir.
  applyAction(s, top, 'support', { id, fromDept: 'TOP', toDept: 'MAL', personIds: ['p1'], shiftId: 'C', date: '2026-11-02', realized: true, note: 'Gece mal kabul dalgası' }, T('2026-11-03T11:00:00Z'));
  const r = s.supports.find(y => y.id === id);
  assert.equal(r.start, '2026-11-02T23:30');
  assert.equal(r.end, '2026-11-03T08:00');
  assert.equal(r.history.at(-1).status, 'rejected', 'ret kararı ve gerekçesi kaydın geçmişinde kalır');
  assert.match(r.history.at(-1).reason, /Vardiya yanlış/);
  x = snapshot(s);
  assert.deepEqual([x.final, x.pending, x.rejected], [0, 1, 0]);
  assert.equal(x.list[0].net, '7:30', 'gece yarısını geçen süre: 8,5 saat − 60 dk mola');

  // 4) İK puantajı yükler; Ece o gün "gelmedi" görünür (puantaj hatası). Kayıt uyumsuz olur, sistem onayı bekletilir.
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1001', date: '2026-11-02', status: 'absent', label: 'Puantaj girilmemiş' }] }, T('2026-11-03T12:00:00Z'));
  assert.equal(mismatches(s, r)[0].code, 'absent');
  r.submittedAt = '2026-10-20T00:00:00Z'; // onay süresi dolmuş gibi: uyumsuzluk varken sistem onaylamamalı
  assert.deepEqual(runRules(s, admin, T('2026-11-04T10:00:00Z')).approved, 0);
  x = snapshot(s);
  assert.deepEqual([x.final, x.pending, x.mismatch, x.openMismatch], [0, 1, '1 / 1', 1]);

  // 5) İK puantajı düzeltir: C vardiyası, 23:30 → 08:00, 7,5 saat. Uyumsuzluk kendiliğinden kalkar.
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1001', date: '2026-11-02', status: 'present', shift: 'C', start: '2026-11-02T23:30', end: '2026-11-03T08:00', hours: 7.5 }] }, T('2026-11-04T08:00:00Z'));
  assert.deepEqual(mismatches(s, r), []);
  x = snapshot(s);
  assert.deepEqual([x.mismatch, x.openMismatch], ['0 / 0', 0]);

  // 6) Mal Kabul onaylar. Bütün raporlar aynı tek kaydı, tek kişiyi ve tek günü gösterir.
  applyAction(s, mal, 'decision', { id, status: 'approved' }, T('2026-11-04T09:00:00Z'));
  assert.equal(counted(s, r), true);
  x = snapshot(s);
  assert.deepEqual(
    { final: x.final, pending: x.pending, rejected: x.rejected, givenTOP: x.givenTOP, receivedMAL: x.receivedMAL, personCount: x.personCount, personDays: x.personDays },
    { final: 1, pending: 0, rejected: 0, givenTOP: 1, receivedMAL: 1, personCount: 1, personDays: 1 },
    'operasyon (özet, birim) ve İK (personel) raporları aynı sayıyı vermeli'
  );
  // Gece yarısını geçen kayıt vardiyanın başladığı güne yazılır; ertesi güne ikinci gün olarak düşmez.
  assert.deepEqual(x.days, ['2026-11-02']);
  assert.equal(x.list.length, 1);
  assert.equal(x.list[0].cls, 'Kesinleşen');

  // Ertesi günü süzen rapor bu kaydı göstermez: kayıt vardiya başlangıç gününe aittir (belgede yazılı kural).
  const ertesi = buildReport('ozet', s, { ...FILTER, from: '2026-11-03', to: '2026-11-03' });
  assert.equal(section(ertesi, 'Özet').rows.find(row => row[0] === 'Toplam destek kaydı')[1], 0);
});

test('kabul: puantaj düzeltmesi incelenmiş notu temizler ve eski notu geçmişte saklar', () => {
  const { s, admin, top, mal } = setup();
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1001', date: '2026-11-02', status: 'absent' }] }, T('2026-11-03T08:00:00Z'));
  applyAction(s, top, 'support', { fromDept: 'TOP', toDept: 'MAL', personIds: ['p1'], shiftId: 'C', date: '2026-11-02', realized: true }, T('2026-11-03T09:00:00Z'));
  const r = s.supports[0];
  applyAction(s, mal, 'resolve', { id: r.id, reason: 'Vardiya amiri gece çalıştığını doğruladı.' }, T('2026-11-03T10:00:00Z'));
  assert.equal(snapshot(s).openMismatch, 0);
  applyAction(s, admin, 'import', { kind: 'attendance', rows: [{ code: '1001', date: '2026-11-02', status: 'present', shift: 'C', start: '2026-11-02T23:30', end: '2026-11-03T08:00', hours: 7.5 }] }, T('2026-11-03T12:00:00Z'));
  assert.equal(r.issueResolved, false);
  assert.match(r.issueHistory.at(-1).note, /gece çalıştığını/);
  assert.deepEqual(mismatches(s, r), []);
});
