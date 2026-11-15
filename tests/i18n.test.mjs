// Dil desteği: sözlük, kalıplı ve çok satırlı çeviri, sunucu hata iletileri ve İngilizce demo verisi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translateText } from '../lib/i18n/translate.mjs';
import { langOf, tx, translateState } from '../server/i18n.mjs';
import { seed, sampleHistory } from '../lib/domain.mjs';

const EN = JSON.parse(readFileSync(new URL('../lib/i18n/en.json', import.meta.url), 'utf8'));

test('sözlükte boş karşılık yok', () => {
  for (const [k, v] of Object.entries(EN)) assert.ok(typeof v === 'string' && v.length > 0, k);
});

test('birleştirilmiş sunucu iletisi ve çok satırlı hata çevrilir', () => {
  assert.equal(translateText(EN, 'Onay süresi (gün) 1–30 arasında olmalı.'), 'Approval period (days) must be between 1 and 30.');
  assert.equal(
    translateText(EN, '2 kayıtta hata var, hiçbir kayıt açılmadı.\nSatır 1: Tarih seçin.\nSatır 3: Kayıt bulunamadı.'),
    '2 records have errors; no record was created.\nRow 1: Choose a date.\nRow 3: Record not found.',
  );
});

test('dil çerezden okunur; Türkçe istekte ileti değişmez', () => {
  assert.equal(langOf({ headers: { cookie: 'a=1; destek_dil=en' } }), 'en');
  assert.equal(langOf({ headers: {} }), 'tr');
  assert.equal(tx('en', 'Kayıt bulunamadı.'), 'Record not found.');
  assert.equal(tx('tr', 'Kayıt bulunamadı.'), 'Kayıt bulunamadı.');
});

test('demo verisi İngilizce açılır; kimlik, kod ve durumlar değişmez', () => {
  const s = seed('w1', 'demo@ornek.test');
  sampleHistory(s);
  const en = translateState('en', s);
  assert.ok(en.departments.some((d) => d.name === 'Picking'));
  en.departments.forEach((d, i) => assert.equal(d.id, s.departments[i].id));
  en.supports?.forEach((r, i) => assert.equal(r.status, s.supports[i].status));
  assert.deepEqual(translateState('tr', s), s);
});

test('İngilizcede sayı 1 ise çoğul isim tekile döner', async () => {
  const { fill, singularize } = await import('../lib/i18n/translate.mjs');
  assert.equal(fill('{0} tasks overdue', [1]), '1 task overdue');
  assert.equal(fill('{0} tasks overdue', [3]), '3 tasks overdue');
  assert.equal(fill('{0} of {1} records', [1, 1]), '1 of 1 record');
  assert.equal(singularize('timesheet warnings'), 'timesheet warning');
  assert.equal(singularize('People'), 'Person');
  assert.equal(singularize('In progress'), 'In progress');
});

test('derleme: sayının ardındaki JSX metni __tn ile çevrilir', async () => {
  const { donustur } = await import('../ceviri/donustur.mjs');
  const out = donustur('const a = <p><b>{list.length} puantaj uyarısı</b><strong>{n}<em>uyarı</em></strong></p>;', new Set(['puantaj uyarısı', 'uyarı']), 'rt');
  assert.match(out, /__tn\(\(list\.length\), "puantaj uyarısı"\)/);
  assert.match(out, /__tn\(\(n\), "uyarı"\)/);
});

test('derleme: sayıdan sonra gelen ayrı metin ve etiket biçimleri de __tn alır', async () => {
  const { donustur } = await import('../ceviri/donustur.mjs');
  const d = new Set([' iş', 'geciken iş']);
  const out = donustur(`const a = <p><span>\n{x.length}\n{' iş'}\n</span><b><strong>{s.late}</strong>\n<small>geciken iş</small></b><i>{f(x)}{' iş'}</i></p>;`, d, 'rt');
  assert.match(out, /__tn\(\(x\.length\), " iş"\)/);
  assert.match(out, /__tn\(\(s\.late\), "geciken iş"\)/);
  assert.match(out, /\{__t\(" iş"\)\}<\/i>/); // çağrı ifadesi iki kez yazılmaz
});

test('derleme: sayı + metin birleştirmesi de __tn alır', async () => {
  const { donustur } = await import('../ceviri/donustur.mjs');
  const out = donustur("const a = t.count + ' kez';", new Set([' kez']), 'rt');
  assert.match(out, /t\.count \+ __tn\(\(t\.count\), " kez"\)/);
});
