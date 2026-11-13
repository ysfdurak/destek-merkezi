import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TIME_ZONE, today } from '../lib/domain.mjs';

const NAME = /^destek-\d{4}-\d{2}-\d{2}\.sqlite$/;

// Günde bir kez, belirlenen saatten sonra veritabanının tutarlı bir kopyasını alır
// ve en yeni 'keep' kopyayı saklar. Sunucu çalışırken alınır; durdurmak gerekmez.
export function backupWorker(store, { dir, keep = 14, hour = 2, enabled = true }) {
  const state = { last: null, error: '' };
  if (enabled) mkdirSync(dir, { recursive: true });
  const files = () => readdirSync(dir).filter(f => NAME.test(f)).sort();
  if (enabled && files().length) state.last = statSync(join(dir, files().at(-1))).mtime.toISOString();

  function run(now = new Date()) {
    if (!enabled) return false;
    if (!store.db.prepare("SELECT 1 FROM meta WHERE id='main'").get()) return false; // kurulum yapılmadan yedek alma
    const localHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));
    const name = `destek-${today(now)}.sqlite`;
    if (localHour < hour || files().includes(name)) return false;
    const temporary = join(dir, name + '.' + process.pid + '.tmp');
    try {
      store.backup(temporary);
      renameSync(temporary, join(dir, name));
      for (const old of files().slice(0, Math.max(0, files().length - keep))) rmSync(join(dir, old));
      state.last = now.toISOString();
      state.error = '';
      return true;
    } catch (error) {
      rmSync(temporary, { force: true });
      state.error = error.message;
      console.error('Yedek alınamadı:', error.message);
      return false;
    }
  }
  return { run, info: () => ({ ...state, enabled, keep, hour }) };
}
