// Sunucu tarafı dil desteği. Arayüzle aynı sözlüğü (lib/i18n/en.json) kullanır.
// Dil: "destek_dil" çerezi (arayüz ?lang= ile yazar). Sunucu hata iletileri ve İngilizce açılan demo alanı için.
import { readFileSync } from 'node:fs';
import { translateText, translateDeep } from '../lib/i18n/translate.mjs';

const EN = JSON.parse(readFileSync(new URL('../lib/i18n/en.json', import.meta.url), 'utf8'));

export const langOf = (req) => (/(?:^|;\s*)destek_dil=en(?:;|$)/.test(req.headers.cookie ?? '') ? 'en' : 'tr');
export const tx = (lang, s) => (lang === 'en' ? translateText(EN, s) : s);
/** Demo verisini İngilizceye çevirir; kimlik, kod, durum ve e-posta alanlarına dokunmaz. */
export const translateState = (lang, state) =>
  lang === 'en' ? translateDeep(EN, state, new Set(['id', 'code', 'status', 'kind', 'role', 'email', 'type', 'deptId', 'locationId', 'shiftId', 'parentId', 'userId', 'start', 'end', 'date'])) : state;
