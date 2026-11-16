// Ziyaretçi demo alanları (portföy sunucusu).
// Her ziyaretçi, giriş yapmadan, örnek verilerle dolu ve yalnızca kendisine ait bir çalışma alanı açar.
// Alan ayrı bir SQLite dosyasıdır; son kullanımdan 'ttlHours' saat sonra tümüyle silinir.
// Gerçek bir kişiye e-posta gitmez, yedek alınmaz. Kişisel veri tutulmaz; günlük sayaçlar yalnızca adet tutar.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from './store.mjs';
import { sampleHistory, seed, today } from '../lib/domain.mjs';
import { translateState } from './i18n.mjs';

const FILE = /^[a-f0-9]{32}\.sqlite$/;
export const DEMO_COOKIE = 'destek_demo';

export function demoManager({ dir, ttlHours = 72, max = 200, perIpHour = 10, passwordHash }) {
  mkdirSync(dir, { recursive: true });
  const ttl = ttlHours * 3600000;
  const open = new Map(); // dosya adı → { store, used }
  const created = new Map(); // IP → { count, until }
  const stats = new DatabaseSync(join(dir, 'istatistik.db'));
  stats.exec('CREATE TABLE IF NOT EXISTS sayac (gun TEXT NOT NULL, tur TEXT NOT NULL, adet INTEGER NOT NULL, PRIMARY KEY (gun, tur))');
  const bump = stats.prepare('INSERT INTO sayac VALUES (?,?,1) ON CONFLICT(gun,tur) DO UPDATE SET adet=adet+1');
  const count = kind => bump.run(today(), kind);

  const fileOf = token => createHash('sha256').update(token).digest('hex').slice(0, 32) + '.sqlite';
  const files = () => readdirSync(dir).filter(name => FILE.test(name));

  function close(name) {
    const entry = open.get(name);
    if (!entry) return;
    try { entry.store.db.close(); } catch {}
    open.delete(name);
  }
  function remove(name) {
    close(name);
    for (const suffix of ['', '-wal', '-shm']) rmSync(join(dir, name + suffix), { force: true });
  }
  // Son kullanım zamanı dosyanın değiştirilme zamanıdır; dakikada en fazla bir kez güncellenir.
  function touch(name, entry) {
    const now = Date.now();
    if (now - entry.used < 60000) return;
    entry.used = now;
    const time = new Date(now);
    try { utimesSync(join(dir, name), time, time); } catch {}
  }

  // Çerezdeki anahtara ait alanı açar; yoksa veya süresi dolmuşsa null döner.
  function storeFor(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    const name = fileOf(token);
    let entry = open.get(name);
    if (!entry) {
      const path = join(dir, name);
      if (!existsSync(path)) return null;
      if (Date.now() - statSync(path).mtimeMs > ttl) { remove(name); return null; }
      entry = { store: openStore(path), used: 0 };
      open.set(name, entry);
    }
    touch(name, entry);
    return entry.store;
  }

  function create(ip, lang = 'tr') {
    let limit = created.get(ip);
    if (!limit || limit.until < Date.now()) limit = { count: 0, until: Date.now() + 3600000 };
    if (limit.count >= perIpHour) throw Object.assign(new Error('Bu bağlantıdan çok fazla demo alanı açıldı. Bir saat sonra yeniden deneyin.'), { status: 429 });
    if (files().length >= max) cleanup();
    if (files().length >= max) throw Object.assign(new Error('Demo alanları şu an dolu. Biraz sonra yeniden deneyin.'), { status: 503 });
    limit.count++;
    created.set(ip, limit);
    const token = randomBytes(32).toString('hex');
    const name = fileOf(token);
    const store = openStore(join(dir, name));
    const id = randomUUID();
    const state = seed(id, 'demo@ornek.test');
    state.users[0].name = 'Demo Yönetici';
    state.isDemo = true;
    sampleHistory(state);
    // Demo kullanıcısının parolası yoktur (rastgele, kimseye gösterilmez); alana yalnızca çerezle girilir.
    // İngilizce arayüzden açılan alan İngilizce örnek verilerle gelir (birim, kişi rolleri, açıklamalar, geçmiş)
    store.initialize(id, translateState(lang, state), passwordHash(randomBytes(24).toString('hex')));
    open.set(name, { store, used: Date.now() });
    count('olusturma');
    return { token, store, userId: id };
  }

  function reset(token) {
    if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) remove(fileOf(token));
  }

  // Süresi dolan alanları siler, 15 dakikadır kullanılmayan dosyaları kapatır.
  function cleanup(now = Date.now()) {
    let removed = 0;
    for (const name of files()) {
      const path = join(dir, name);
      let mtime;
      try { mtime = statSync(path).mtimeMs; } catch { continue; }
      if (now - mtime > ttl) { remove(name); removed++; }
    }
    for (const [name, entry] of open) if (now - entry.used > 900000) close(name);
    for (const [ip, limit] of created) if (limit.until < now) created.delete(ip);
    return removed;
  }

  function summary(days = 30) {
    const rows = stats.prepare('SELECT gun, tur, adet FROM sayac WHERE gun >= ? ORDER BY gun').all(today(new Date(Date.now() - days * 86400000)));
    return { active: files().length, max, ttlHours, rows };
  }

  return { storeFor, create, reset, cleanup, count, summary, ttlHours };
}
