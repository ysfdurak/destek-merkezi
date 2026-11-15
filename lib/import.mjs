// Excel/CSV satırlarını sunucunun beklediği biçime çevirir. Tarayıcıda çalışır, testlerde Node ile denenir.
// Dosya { raw:true } ile okunur: tarih ve saat hücreleri Excel seri sayısı olarak gelir, metinler metin olarak.

export const SUPPORT_FIELDS = [
  { key: 'date', label: 'Tarih', required: true, aliases: ['tarih', 'gün', 'gun', 'date'] },
  { key: 'code', label: 'Sicil', required: true, aliases: ['sicil', 'sicil no', 'sicilno', 'personel no', 'code', 'staff id'] },
  { key: 'shift', label: 'Vardiya', aliases: ['vardiya', 'vardiya kodu', 'shift'] },
  { key: 'start', label: 'Başlangıç', aliases: ['başlangıç', 'baslangic', 'başlangıç saati', 'giriş', 'start'] },
  { key: 'end', label: 'Bitiş', aliases: ['bitiş', 'bitis', 'bitiş saati', 'çıkış', 'end'] },
  { key: 'break', label: 'Mola (dk)', aliases: ['mola', 'mola (dk)', 'mola dk', 'break'] }
];

export const FIELDS = {
  attendance: [
    { key: 'code', label: 'Sicil', required: true, aliases: ['sicil', 'sicil no', 'sicilno', 'personel no', 'personel kodu', 'code', 'staff id'] },
    { key: 'date', label: 'Tarih', required: true, aliases: ['tarih', 'gün', 'gun', 'date', 'çalışma tarihi'] },
    { key: 'status', label: 'Durum / puantaj kodu', required: true, aliases: ['durum', 'puantaj kodu', 'puantaj', 'devam', 'devam durumu', 'status', 'kod'] },
    { key: 'start', label: 'Giriş saati', aliases: ['giriş', 'giris', 'giriş saati', 'giris saati', 'başlangıç', 'start', 'in'] },
    { key: 'end', label: 'Çıkış saati', aliases: ['çıkış', 'cikis', 'çıkış saati', 'cikis saati', 'bitiş', 'end', 'out'] },
    { key: 'shift', label: 'Vardiya', aliases: ['vardiya', 'vardiya kodu', 'shift'] },
    { key: 'hours', label: 'Çalışma süresi', aliases: ['çalışma süresi', 'calisma suresi', 'çalışılan süre', 'çalışılan saat', 'çalışma saati', 'net süre', 'fiili süre', 'süre', 'sure', 'saat', 'working time', 'hours'] }
  ]
};

export const norm = v => String(v ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

// Başlık adlarından alan eşleştirmesi tahmin eder: { code: 'Sicil No', date: 'Tarih', ... }
export function guessMapping(headers, kind) {
  const mapping = {};
  for (const field of (Array.isArray(kind) ? kind : FIELDS[kind])) {
    const hit = headers.find(h => field.aliases.includes(norm(h))) ?? headers.find(h => field.aliases.some(a => norm(h).startsWith(a)));
    mapping[field.key] = hit ?? '';
  }
  return mapping;
}

// Puantaj durum kodları: present = işe geldi, absent = işte değil (devamsızlık, izin, rapor, tatil), skip = satırı alma.
export function guessStatus(value) {
  const v = norm(value);
  if (!v) return '';
  if (/^(gelmedi|yok|absent|d|ü|mazeretsiz|ht|yi|ri|üi|ui)$/.test(v) || /(devamsız|devamsiz|izin|rapor|tatil|bayram|hasta)/.test(v)) return 'absent';
  if (/^(geldi|var|present|x|n|g|normal|çalıştı|calisti|mesai|tam|1|evet)$/.test(v)) return 'present';
  return '';
}
export const STATUS_OPTIONS = [['present', 'İşe geldi'], ['absent', 'İşte değil (devamsızlık, izin, rapor, tatil)'], ['skip', 'Satırı alma']];

const pad = n => String(n).padStart(2, '0');
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function serialParts(serial) {
  const ms = Math.round(serial * 1440) * 60000; // dakikaya yuvarla (Excel 18:30'u 18:29:59,99 saklayabilir)
  const d = new Date(EXCEL_EPOCH + ms);
  return { date: d.toISOString().slice(0, 10), time: pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()), hasDate: serial >= 1 };
}

// Tarih: Excel seri sayısı, 2026-11-04, 04.11.2026, 4/11/2026, 4.11.26 (gün önce) → 'YYYY-AA-GG'
export function toDate(value) {
  if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value >= 1 && value < 2958466) return serialParts(value).date;
  const v = String(value ?? '').trim().split(/[ T]/)[0];
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(v);
  if (m) return check(m[1], m[2], m[3]);
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/.exec(v);
  if (m) return check(m[3].length === 2 ? '20' + m[3] : m[3], m[2], m[1]);
  return '';
}
function check(y, mo, d) {
  const s = y + '-' + pad(mo) + '-' + pad(d);
  const t = new Date(s + 'T00:00:00Z');
  return !isNaN(t) && t.toISOString().startsWith(s) ? s : '';
}

// Saat: Excel kesir/seri sayısı, '7:30', '07:30:00', '04.11.2026 07:30' → { date?, time }
export function toTime(value) {
  if (value === '' || value == null) return null;
  if (typeof value === 'number' && value >= 0) {
    const p = serialParts(value);
    return { time: p.time, date: p.hasDate ? p.date : null };
  }
  const v = String(value).trim();
  const m = /(\d{1,2})[:;.](\d{2})(?:[:;]\d{2})?\s*$/.exec(v);
  if (!m || +m[1] > 24 || +m[2] > 59) return undefined;
  const hasDate = /\d{1,4}[-./]\d{1,2}[-./]\d{1,4}/.test(v);
  return { time: pad(+m[1] === 24 ? 0 : +m[1]) + ':' + m[2], date: hasDate ? toDate(v) || null : null, nextDay: +m[1] === 24 };
}
// Çalışma süresi → saat (ondalık). '07:30', '07;30', '7:30:00' saat:dakika; '7,5' veya '7.5' ondalık saat;
// Excel süre hücresi (gün kesri, ör. 0,3125) da kabul edilir. Dönüş: sayı, boşsa null, okunamazsa undefined.
export function toHours(value) {
  if (value === '' || value == null) return null;
  let h;
  if (typeof value === 'number') h = value < 1 ? value * 24 : value;
  else {
    const v = String(value).trim();
    let m = /^(\d{1,2})[:;](\d{2})(?:[:;]\d{2})?$/.exec(v);
    if (m) { if (+m[2] > 59) return undefined; h = +m[1] + +m[2] / 60; }
    else if (/^\d{1,2}([.,]\d+)?$/.test(v)) h = Number(v.replace(',', '.'));
    else return undefined;
  }
  h = Math.round(h * 60) / 60;
  return h >= 0 && h <= 24 ? h : undefined;
}
const addDay = d => new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);

// Ham satırları dönüştürür. rowOffset: başlık satırı 1 ise ilk veri satırı Excel'de 2'dir.
// Dönüş: { rows, errors, skipped }
export function buildRows(records, mapping, kind, statusMap = {}, rowOffset = 2) {
  const rows = [], errors = [];
  let skipped = 0;
  records.forEach((rec, i) => {
    const excelRow = i + rowOffset;
    const get = key => mapping[key] ? rec[mapping[key]] : '';
    if (Object.values(rec).every(v => String(v ?? '').trim() === '')) { skipped++; return; }
    const err = m => errors.push('Satır ' + excelRow + ': ' + m);
    const date = toDate(get('date'));
    if (!date) return err('Tarih okunamadı (' + String(get('date') ?? '') + ').');
    if (kind === 'attendance') {
      const code = String(get('code') ?? '').trim();
      if (!code) return err('Sicil boş.');
      const label = String(get('status') ?? '').trim();
      const status = statusMap[norm(label)] ?? guessStatus(label);
      if (status === 'skip') { skipped++; return; }
      if (!status) return err('Durum kodu eşleştirilmedi: "' + label + '".');
      const row = { _row: excelRow, code, date, status, label };
      const s = toTime(get('start')), e = toTime(get('end'));
      if (s === undefined || e === undefined) return err('Giriş/çıkış saati okunamadı.');
      const hours = toHours(get('hours'));
      if (hours === undefined) return err('Çalışma süresi okunamadı (' + String(get('hours')) + '). Örnek: 07:30, 07;30 veya 7,5.');
      if (status === 'present' && hours !== null) row.hours = hours;
      const shift = String(get('shift') ?? '').trim();
      if (shift) row.shift = shift;
      if (status === 'present' && s && e) {
        const startDate = s.date ?? date;
        let endDate = e.date ?? startDate;
        // Çıkış girişten küçükse gece vardiyasıdır: çıkış ertesi gündür.
        if (!e.date && (e.time <= s.time || e.nextDay)) endDate = addDay(startDate);
        row.start = startDate + 'T' + s.time;
        row.end = endDate + 'T' + e.time;
      } else if (status === 'present' && (s || e)) return err('Giriş ve çıkış saatleri birlikte girilmeli.');
      rows.push(row);
    }
  });
  return { rows, errors, skipped };
}

// Puantaj durum sütunundaki farklı değerler (eşleştirme ekranı için).
export function distinctStatuses(records, column, limit = 40) {
  const seen = new Map();
  for (const r of records) {
    const label = String(r[column] ?? '').trim();
    if (!seen.has(norm(label))) seen.set(norm(label), label);
    if (seen.size >= limit) break;
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

// Toplu destek girişi için Excel satırları → { date, shiftId, start, end, breakMinutes, personId }.
// Vardiya seçiliyse ve saat boşsa saatler vardiyadan gelir. Bitiş başlangıçtan küçükse ertesi gündür.
export function buildSupportRows(records, mapping, people, shifts, rowOffset = 2) {
  const rows = [], errors = [];
  records.forEach((rec, i) => {
    const excelRow = i + rowOffset;
    const get = key => mapping[key] ? rec[mapping[key]] : '';
    if (Object.values(rec).every(v => String(v ?? '').trim() === '')) return;
    const err = m => errors.push('Satır ' + excelRow + ': ' + m);
    const date = toDate(get('date'));
    if (!date) return err('Tarih okunamadı.');
    const code = String(get('code') ?? '').trim();
    const person = people.find(p => p.code === code);
    if (!person) return err('Sicil bulunamadı veya bu bölümde değil: ' + (code || 'boş'));
    const shiftText = norm(get('shift'));
    const shift = shiftText ? shifts.find(x => norm(x.id) === shiftText || norm(x.name) === shiftText) : null;
    if (shiftText && !shift) return err('Bilinmeyen vardiya: ' + get('shift'));
    const s = toTime(get('start')), e = toTime(get('end'));
    if (s === undefined || e === undefined) return err('Saat okunamadı.');
    const start = s?.time ?? shift?.start, end = e?.time ?? shift?.end;
    if (!start || !end) return err('Başlangıç ve bitiş saati (veya vardiya) gerekli.');
    const brk = get('break') === '' || get('break') == null ? 0 : Number(String(get('break')).replace(',', '.'));
    if (!Number.isFinite(brk) || brk < 0) return err('Mola dakika olarak sayı olmalı.');
    rows.push({ _row: excelRow, date, shiftId: shift?.id ?? '', startTime: start, endTime: end, breakMinutes: Math.round(brk), personId: person.id });
  });
  return { rows, errors };
}
