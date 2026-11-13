import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const tables = ['locations','departments','people','users','supports','attendance','volumes','windows','events','notifications','imports','shifts','orgUnits','settings'];
const relations = {
  departments: { location_id: 'locationId' },
  people: { dept_id: 'deptId' },
  supports: { from_dept: 'fromDept', to_dept: 'toDept' },
  attendance: { person_id: 'personId' },
  volumes: { dept_id: 'deptId' }
};

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
    .replaceAll('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ');
  db.exec(schema);
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (user_id TEXT PRIMARY KEY REFERENCES users(id), password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS local_config (id TEXT PRIMARY KEY, demo INTEGER NOT NULL);
  `);
  const reader = Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT data FROM ${table} ORDER BY rowid`)]));
  const writers = Object.fromEntries(tables.map(table => {
    const keys = Object.keys(relations[table] ?? {});
    const columns = ['id', ...keys, 'data'];
    const assignment = columns.slice(1).map(key => `${key}=excluded.${key}`).join(',');
    return [table, db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${assignment} WHERE ${table}.data<>excluded.data`)];
  }));
  function transaction(fn, write = true) {
    db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function load() {
    const meta = db.prepare("SELECT * FROM meta WHERE id='main'").get();
    if (!meta) return null;
    const state = {};
    for (const table of tables) state[table] = reader[table].all().map(row => JSON.parse(row.data));
    state.settings = state.settings[0];
    state.imports.sort((a,b) => b.time.localeCompare(a.time));
    state.isDemo = db.prepare("SELECT demo FROM local_config WHERE id='main'").get()?.demo === 1;
    state.notifications.sort((a,b) => b.time.localeCompare(a.time));
    state.events.sort((a,b) => b.time.localeCompare(a.time));
    state.supports.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code));
    return { state, meta };
  }
  function save(state) {
    for (const table of tables) {
      const rows = table === 'settings' ? [{ ...state.settings, id: 'config' }] : (state[table] ?? []);
      for (const row of rows) {
        const values = Object.values(relations[table] ?? {}).map(field => row[field]);
        writers[table].run(row.id, ...values, JSON.stringify(row));
      }
    }
    db.prepare("UPDATE meta SET revision=revision+1 WHERE id='main'").run();
  }
  return {
    db,
    read: () => transaction(load, false),
    initialize(owner, state, password) {
      return transaction(() => {
        if (load()) throw new Error('Çalışma alanı zaten kuruldu.');
        db.prepare("INSERT INTO meta (id,owner,revision) VALUES ('main',?,0)").run(owner);
        db.prepare("INSERT INTO local_config (id,demo) VALUES ('main',?)").run(state.isDemo ? 1 : 0);
        save(state);
        db.prepare('INSERT INTO accounts VALUES (?,?)').run(owner, password);
      });
    },
    update(fn, afterSave) {
      return transaction(() => {
        const data = load();
        if (!data) return null;
        if (fn(data) === false) return data;
        save(data.state);
        afterSave?.();
        data.meta.revision++;
        return data;
      });
    },
    // Çalışırken tutarlı bir kopya alır (SQLite VACUUM INTO).
    backup(path) {
      db.exec(`VACUUM INTO '${String(path).replaceAll("'", "''")}'`);
    },
    setPassword(userId, password) {
      db.prepare('INSERT INTO accounts VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET password=excluded.password').run(userId,password);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    }
  };
}
