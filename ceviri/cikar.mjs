// Sözlükte karşılığı olmayan Türkçe arayüz metinlerini listeler.
// node ceviri/cikar.mjs [--dosyali]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidates, isNatural } from './ortak.mjs';
import { toJs } from './donustur.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dict = JSON.parse(fs.readFileSync(path.join(root, 'lib/i18n/en.json'), 'utf8'));
const files = ['app', 'lib'].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => /\.(tsx?|mjs|js)$/.test(f) && f !== 'i18n.js').map((f) => path.join(root, d, f)));
const miss = new Map();
for (const f of files) {
  for (const it of candidates(toJs(fs.readFileSync(f, 'utf8'), f), { keys: true })) {
    const probe = it.kind === 'tpl' ? it.key.replace(/\{\d+\}/g, ' ') : it.key;
    if (!isNatural(probe) || dict[it.key] !== undefined) continue;
    miss.set(it.key, (miss.get(it.key) || new Set()).add(path.relative(root, f)));
  }
}
if (process.argv.includes('--dosyali')) for (const [k, v] of miss) console.log(JSON.stringify(k), [...v].join(', '));
else console.log(JSON.stringify([...miss.keys()], null, 1));
console.error('eksik:', miss.size);
