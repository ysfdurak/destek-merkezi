// Bir kaynak dosyadaki Türkçe metinleri, sözlükte karşılığı varsa, dile göre seçilen çağrılara çevirir.
// TypeScript (tsx) önce esbuild ile JSX korunarak JavaScript'e çevrilir, sonra metinler değiştirilir.
//   "Metin" → __t("Metin") · <b>Metin</b> → <b>{__t("Metin")}</b> · attr="Metin" → attr={__t("Metin")}
//   `a ${x} b` → __tt("a {0} b", x) · 'tr-TR' → __L() · { 'Metin': x } → { [__t("Metin")]: x }
import { transformSync } from 'esbuild';
import { candidates, parse } from './ortak.mjs';

export function toJs(code, file) {
  if (!/\.tsx?$/.test(file)) return code;
  let out = transformSync(code, { loader: file.endsWith('x') ? 'tsx' : 'ts', jsx: 'preserve', format: 'esm', target: 'es2022' }).code;
  // JSX korunduğu için TypeScript "kullanılmıyor" diye React içe aktarımını siler; geri ekle
  const react = code.match(/^import React(?:,\s*\{[^}]*\})? from ['"]react['"];?/m);
  if (react && !/^import React\b/m.test(out)) out = "import React from 'react';\n" + out;
  return out;
}

export function donustur(code, dict, runtime) {
  const items = candidates(code, { keys: true });
  const edits = [];
  for (const it of items) {
    const n = it.node;
    if (it.kind === 'str' && it.key === 'tr-TR') { edits.push({ s: n.start, e: n.end, r: () => '__L()' }); continue; }
    if (!dict.has(it.key)) continue;
    const k = JSON.stringify(it.key);
    if (it.kind === 'str') edits.push({ s: n.start, e: n.end, r: () => `__t(${k})` });
    else if (it.kind === 'key') edits.push({ s: n.start, e: n.end, r: () => `[__t(${k})]` });
    else if (it.kind === 'jsxattr') edits.push({ s: n.start, e: n.end, r: () => `{__t(${k})}` });
    else if (it.kind === 'jsxtext') {
      const lead = n.value.match(/^\s*/)[0], trail = n.value.match(/\s*$/)[0];
      const keepL = /\n/.test(lead) ? '' : lead ? '{" "}' : '';
      const keepT = /\n/.test(trail) ? '' : trail ? '{" "}' : '';
      edits.push({ s: n.start, e: n.end, r: () => `${keepL}{__t(${k})}${keepT}` });
    } else if (it.kind === 'tpl') {
      edits.push({ s: n.start, e: n.end, r: (render) => `__tt(${k}${n.expressions.map((x) => ', (' + render(x.start, x.end) + ')').join('')})` });
    }
  }
  if (!edits.length) return null;
  edits.sort((a, b) => a.s - b.s || b.e - a.e);
  const render = (from, to) => {
    let res = '', pos = from;
    for (const ed of edits) {
      if (ed.s < pos || ed.e > to || ed.s < from) continue;
      res += code.slice(pos, ed.s) + ed.r(render);
      pos = ed.e;
    }
    return res + code.slice(pos, to);
  };
  return `import { __t, __tt, __L } from ${JSON.stringify(runtime)};\n` + render(0, code.length);
}
