// Arayüzü derler (esbuild) ve derlerken Türkçe metinleri sözlüğe göre dile bağlı çağrılara çevirir.
// npm run build → public/app.js
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { donustur, toJs } from './donustur.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'app/i18n.js');
const dict = new Set(Object.keys(JSON.parse(readFileSync(path.join(root, 'lib/i18n/en.json'), 'utf8'))));

const ceviri = {
  name: 'ceviri',
  setup(b) {
    b.onLoad({ filter: /[\\/](app|lib)[\\/][^\\/]+\.(tsx?|mjs|js)$/ }, (args) => {
      const rel = path.relative(root, args.path);
      if (!/^(app|lib)[\\/][^\\/]+$/.test(rel) || args.path === runtime) return null;
      const src = readFileSync(args.path, 'utf8');
      const js = toJs(src, args.path);
      const out = donustur(js, dict, runtime);
      return { contents: out ?? js, loader: 'jsx', resolveDir: path.dirname(args.path) };
    });
  },
};

await build({
  entryPoints: [path.join(root, 'app/entry.tsx')],
  bundle: true, minify: true, legalComments: 'external', target: 'es2022',
  external: ['/fonts/*'], // yazı tipleri sunucudan /fonts/ adresiyle gelir (server/main.mjs)
  outfile: path.join(root, 'public/app.js'),
  plugins: [ceviri],
  logLevel: 'info',
});
