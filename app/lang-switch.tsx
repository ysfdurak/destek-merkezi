import React from 'react';
// @ts-ignore: JavaScript modülü
import { LANG, setLang } from './i18n.js';

// Arayüz dilini değiştirir (Türkçe ↔ English); seçim çerezde tutulur, sayfa yeniden yüklenir.
export default function LangSwitch() {
  const other = LANG === 'en' ? 'tr' : 'en';
  return <button type="button" className="lang-switch" lang={other} onClick={() => setLang(other)}>{other === 'en' ? 'English' : 'Türkçe'}</button>;
}
