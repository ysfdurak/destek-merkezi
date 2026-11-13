// Demo sunucusunun günlük sayaçlarını yazdırır: açılan alan, geri dönüş, işlem.
//   docker exec destek node server/demo-istatistik.mjs [gün sayısı, varsayılan 30]
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = resolve(process.env.DATA_DIR ?? '/data', 'demo');
const file = join(dir, 'istatistik.db');
if (!existsSync(file)) { console.log('Henüz demo sayacı yok.'); process.exit(0); }
const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const db = new DatabaseSync(file, { readOnly: true });
const rows = db.prepare('SELECT gun, tur, adet FROM sayac WHERE gun >= ? ORDER BY gun').all(since);
const byDay = new Map();
for (const r of rows) byDay.set(r.gun, { ...(byDay.get(r.gun) ?? {}), [r.tur]: r.adet });
console.log(`Etkin demo alanı: ${readdirSync(dir).filter(f => /^[a-f0-9]{32}\.sqlite$/.test(f)).length}`);
console.log('GÜN          AÇILAN  DÖNÜŞ  İŞLEM');
let t = [0, 0, 0];
for (const [day, v] of byDay) {
  const n = [v.olusturma ?? 0, v.devam ?? 0, v.islem ?? 0];
  t = t.map((x, i) => x + n[i]);
  console.log(day.padEnd(12), String(n[0]).padStart(6), String(n[1]).padStart(6), String(n[2]).padStart(6));
}
console.log('TOPLAM'.padEnd(12), String(t[0]).padStart(6), String(t[1]).padStart(6), String(t[2]).padStart(6));
