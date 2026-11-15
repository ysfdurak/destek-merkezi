// Toplu destek girişi.
// 1) Kişileri sabitle: kişileri ve tarih aralığını (ör. 3 gün) seç, vardiyayı seç → her kişi ve gün için satır oluşur.
// 2) Satırları kontrol et: vardiyalı satırda saat ve mola vardiyadan gelir (değiştirilemez); vardiyasız satırda elle girilir.
// Aynı tarih ve vardiyadaki (veya aynı saatlerdeki) kişiler tek destek kaydında birleşir. Aynı kişi aynı gün iki kez girilemez.
import React, { useState } from 'react';
import { Copy, Trash2, Upload, Download, X, Pin, Plus } from 'lucide-react';
import { addDays, instant, today, writable, isActive, shiftTimes, shiftBreak, netHours, durationText } from '../lib/domain.mjs';
import { SUPPORT_FIELDS, guessMapping, buildSupportRows } from '../lib/import.mjs';

let rowKey = 0;
const newRow = (date: string, extra: any = {}) => ({ key: ++rowKey, date, shiftId: '', startTime: '09:00', endTime: '13:00', breakMinutes: 0, personId: '', ...extra });
const MAX_DAYS = 31;

export default function BulkEntry({ s, u, busy, error, onSubmit, onClose, download }: any) {
  const myDepts = s.departments.filter((d: any) => writable(u, d.id));
  const [head, setHead] = useState({ fromDept: myDepts[0]?.id ?? '', toDept: s.departments.find((d: any) => d.id !== myDepts[0]?.id)?.id ?? '', realized: true, note: '' });
  const [rows, setRows] = useState<any[]>([]);
  const [pin, setPin] = useState<any>({ personIds: [], from: addDays(today(), -2), to: today(), shiftId: '', startTime: '09:00', endTime: '13:00', breakMinutes: 0, skipSunday: false });
  const [copyDate, setCopyDate] = useState(today());
  const [localError, setLocalError] = useState('');
  const loc = s.departments.find((d: any) => d.id === head.fromDept)?.locationId;
  const shifts = (s.shifts ?? []).filter((x: any) => x.active !== false && (!x.locationId || x.locationId === loc));
  const shiftOf = (id: string) => shifts.find((x: any) => x.id === id);
  const people = s.people.filter((p: any) => p.active && p.deptId === head.fromDept);
  const set = (key: number, patch: any) => setRows(rows.map(r => r.key === key ? { ...r, ...patch } : r));
  const chooseShift = (key: number, shiftId: string) => { const sh = shiftOf(shiftId); set(key, sh ? { shiftId, startTime: sh.start, endTime: sh.end, breakMinutes: shiftBreak(sh) } : { shiftId }); };

  // Satırın gerçek başlangıç/bitişi (vardiyalı ise vardiyadan)
  const timesOf = (r: any) => { const sh = shiftOf(r.shiftId); if (sh) return shiftTimes(sh, r.date); const endDate = r.endTime <= r.startTime ? addDays(r.date, 1) : r.date; return { start: r.date + 'T' + r.startTime, end: endDate + 'T' + r.endTime, breakMinutes: +r.breakMinutes || 0 }; };
  // Aynı kişi aynı gün: satırlar arasında veya mevcut kayıtlarla
  const dupKeys = (() => { const seen = new Map<string, number>(); rows.filter(r => r.personId).forEach(r => seen.set(r.personId + r.date, (seen.get(r.personId + r.date) ?? 0) + 1)); return seen; })();
  const existing = (r: any) => r.personId && s.supports.find((x: any) => isActive(x) && x.personIds.includes(r.personId) && x.start.slice(0, 10) === r.date);
  const rowProblem = (r: any) => !r.personId ? '' : (dupKeys.get(r.personId + r.date) ?? 0) > 1 ? 'Bu kişi bu tarihte iki kez var' : existing(r) ? 'Bu tarihte zaten kaydı var (' + existing(r).code + ')' : '';

  function applyPin() {
    setLocalError('');
    if (!pin.personIds.length) return setLocalError('Sabitlenecek en az bir kişi seçin.');
    if (!pin.from || !pin.to || pin.from > pin.to) return setLocalError('Tarih aralığını kontrol edin.');
    const days: string[] = [];
    for (let d = pin.from; d <= pin.to && days.length <= MAX_DAYS; d = addDays(d, 1)) if (!(pin.skipSunday && new Date(d + 'T00:00:00Z').getUTCDay() === 0)) days.push(d);
    if (days.length > MAX_DAYS) return setLocalError('En fazla ' + MAX_DAYS + ' gün seçilebilir.');
    const sh = shiftOf(pin.shiftId);
    const extra = sh ? { shiftId: sh.id, startTime: sh.start, endTime: sh.end, breakMinutes: shiftBreak(sh) } : { shiftId: '', startTime: pin.startTime, endTime: pin.endTime, breakMinutes: pin.breakMinutes };
    setRows([...rows.filter(r => r.personId), ...days.flatMap(d => pin.personIds.map((personId: string) => newRow(d, { ...extra, personId })))]);
  }
  function copyLastDay() {
    const mine = s.supports.filter((r: any) => r.fromDept === head.fromDept && isActive(r));
    if (!mine.length) return setLocalError('Bu bölümün kopyalanacak kaydı yok.');
    const last = mine.map((r: any) => r.start.slice(0, 10)).sort().at(-1);
    const copied = mine.filter((r: any) => r.start.slice(0, 10) === last).flatMap((r: any) => r.personIds.map((personId: string) => newRow(copyDate, { shiftId: r.shiftId ?? '', startTime: r.start.slice(11), endTime: r.end.slice(11), breakMinutes: r.breakMinutes, personId })));
    setHead({ ...head, toDept: mine.find((r: any) => r.start.slice(0, 10) === last).toDept });
    setRows([...rows.filter(r => r.personId), ...copied]);
    setLocalError('');
  }
  async function fromExcel(f: File) {
    setLocalError('');
    try {
      const XLSX: any = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const records: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: '' });
      if (!records.length || records.length > 300) throw new Error('Dosya 1–300 satır içermeli.');
      const mapping: any = guessMapping(Object.keys(records[0]), SUPPORT_FIELDS);
      const missing = SUPPORT_FIELDS.filter(x => x.required && !mapping[x.key]).map(x => x.label);
      if (missing.length) throw new Error('Sütun bulunamadı: ' + missing.join(', ') + '. Şablondaki başlıkları kullanın.');
      const { rows: parsed, errors } = buildSupportRows(records, mapping, people, shifts);
      if (errors.length) throw new Error(errors.slice(0, 15).join('\n'));
      setRows([...rows.filter(r => r.personId), ...parsed.map((p: any) => { const sh = shiftOf(p.shiftId); return newRow(p.date, sh ? { ...p, startTime: sh.start, endTime: sh.end, breakMinutes: shiftBreak(sh) } : p); })]);
    } catch (e: any) { setLocalError(e.message); }
  }
  function submit() {
    setLocalError('');
    const filled = rows.filter(r => r.personId);
    if (!filled.length) return setLocalError('En az bir satırda personel olmalı.');
    const bad = filled.map((r, i) => rowProblem(r) && 'Satır ' + (i + 1) + ': ' + rowProblem(r)).filter(Boolean);
    if (bad.length) return setLocalError(bad.slice(0, 15).join('\n'));
    const groups = new Map<string, any>();
    filled.forEach((r, i) => {
      const t = timesOf(r);
      const k = [r.date, r.shiftId, t.start, t.end, t.breakMinutes].join('|');
      if (!groups.has(k)) groups.set(k, { _row: i + 1, fromDept: head.fromDept, toDept: head.toDept, personIds: [], date: r.date, ...t, realized: head.realized && instant(t.end) <= new Date(), shiftId: r.shiftId || null, note: head.note });
      groups.get(k).personIds.push(r.personId);
    });
    onSubmit([...groups.values()]);
  }
  const filled = rows.filter(r => r.personId);
  const groupsCount = new Set(filled.map(r => { const t = timesOf(r); return [r.date, r.shiftId, t.start, t.end, t.breakMinutes].join('|'); })).size;
  const pinShift = shiftOf(pin.shiftId);
  return <div className="modal-backdrop" onClick={() => !busy && onClose()}><section className="modal wide bulk" role="dialog" aria-modal="true" aria-label="Toplu destek girişi" onClick={e => e.stopPropagation()}>
    <header><div><span className="eyebrow">DESTEK MERKEZİ</span><h2>Toplu destek girişi</h2></div><button className="icon-button" aria-label="Kapat" onClick={onClose}><X size={19} /></button></header>
    <div className="modal-content">
      <div className="form-grid">
        <label>Destek veren bölüm<select value={head.fromDept} onChange={e => { setHead({ ...head, fromDept: e.target.value }); setRows([]); setPin({ ...pin, personIds: [] }); }}>{myDepts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Destek alan bölüm<select value={head.toDept} onChange={e => setHead({ ...head, toDept: e.target.value })}>{s.departments.filter((d: any) => d.id !== head.fromDept).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Kayıt türü<select value={head.realized ? '1' : '0'} onChange={e => setHead({ ...head, realized: e.target.value === '1' })}><option value="1">Gerçekleşen (bitişi gelmemişler planlanan girilir)</option><option value="0">Planlanan</option></select></label>
        <label>Açıklama (tüm kayıtlara)<input value={head.note} maxLength={300} onChange={e => setHead({ ...head, note: e.target.value })} /></label>
      </div>

      <div className="pin-box">
        <div className="pin-title"><Pin size={15} /><strong>Kişileri sabitle, günleri seç</strong><span>Seçilen her kişi için seçilen her güne satır oluşur.</span></div>
        <div className="pin-people">{people.map((p: any) => <label key={p.id} className={pin.personIds.includes(p.id) ? 'checked' : ''}><input type="checkbox" checked={pin.personIds.includes(p.id)} onChange={e => setPin({ ...pin, personIds: e.target.checked ? [...pin.personIds, p.id] : pin.personIds.filter((x: string) => x !== p.id) })} />{p.name}<small>{p.code}</small></label>)}{!people.length && <span className="muted">Bu bölümde aktif personel yok.</span>}</div>
        <div className="pin-row">
          <label>Başlangıç<input type="date" value={pin.from} onChange={e => setPin({ ...pin, from: e.target.value })} /></label>
          <label>Bitiş<input type="date" value={pin.to} onChange={e => setPin({ ...pin, to: e.target.value })} /></label>
          <label>Vardiya<select value={pin.shiftId} onChange={e => setPin({ ...pin, shiftId: e.target.value })}><option value="">Vardiya dışı / kısmi</option>{shifts.map((x: any) => <option key={x.id} value={x.id}>{x.name} · {x.start}–{x.end}</option>)}</select></label>
          {pinShift ? <div className="shift-fixed"><strong>{pinShift.start}–{pinShift.end} · net {durationText(netHours(shiftTimes(pinShift, '2026-01-01')))}</strong><span>Yemek {pinShift.mealMinutes || 0} + çay {pinShift.teaMinutes || 0} dk mola</span></div> : <>
            <label>Başlangıç saati<input type="time" value={pin.startTime} onChange={e => setPin({ ...pin, startTime: e.target.value })} /></label>
            <label>Bitiş saati<input type="time" value={pin.endTime} onChange={e => setPin({ ...pin, endTime: e.target.value })} /></label>
            <label>Mola (dk)<input type="number" min="0" value={pin.breakMinutes} onChange={e => setPin({ ...pin, breakMinutes: e.target.value })} /></label></>}
          <label className="checkbox-line"><input type="checkbox" checked={pin.skipSunday} onChange={e => setPin({ ...pin, skipSunday: e.target.checked })} />Pazarları atla</label>
          <button className="button primary small" onClick={applyPin}><Plus size={14} />Satırları oluştur</button>
        </div>
      </div>

      <div className="bulk-tools">
        <span className="bulk-copy"><input type="date" aria-label="Kopyalanacak tarih" value={copyDate} onChange={e => setCopyDate(e.target.value)} /><button className="button small" onClick={copyLastDay}><Copy size={14} />Son günü bu tarihe kopyala</button></span>
        <label className="button small"><Upload size={14} />Excel'den doldur<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) fromExcel(f); e.target.value = ''; }} /></label>
        <button className="button small" onClick={() => download('toplu-destek-sablon.xlsx', [{ Tarih: today(), Sicil: people[0]?.code ?? '1001', Vardiya: shifts[0]?.id ?? '', 'Başlangıç': '', 'Bitiş': '', 'Mola (dk)': '' }, { Tarih: today(), Sicil: people[1]?.code ?? '1002', Vardiya: '', 'Başlangıç': '13:00', 'Bitiş': '17:00', 'Mola (dk)': 0 }])}><Download size={14} />Şablon</button>
        <button className="button small" onClick={() => setRows([...rows, newRow(rows.at(-1)?.date ?? today(), rows.at(-1) ? { shiftId: rows.at(-1).shiftId, startTime: rows.at(-1).startTime, endTime: rows.at(-1).endTime, breakMinutes: rows.at(-1).breakMinutes } : {})])}><Plus size={14} />Boş satır</button>
      </div>
      {rows.length > 0 ? <div className="table-scroll"><table className="bulk-table"><thead><tr><th>TARİH</th><th>VARDİYA</th><th>BAŞLANGIÇ</th><th>BİTİŞ</th><th>MOLA (DK)</th><th>NET</th><th>PERSONEL</th><th><span className="sr-only">İşlemler</span></th></tr></thead><tbody>
        {rows.map(r => { const fixed = !!shiftOf(r.shiftId), problem = rowProblem(r), t = timesOf(r); return <tr key={r.key} className={problem ? 'row-problem' : ''}>
          <td><input type="date" value={r.date} onChange={e => set(r.key, { date: e.target.value })} /></td>
          <td><select value={r.shiftId} onChange={e => chooseShift(r.key, e.target.value)}><option value="">—</option>{shifts.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
          <td><input type="time" value={r.startTime} disabled={fixed} onChange={e => set(r.key, { startTime: e.target.value })} /></td>
          <td><input type="time" value={r.endTime} disabled={fixed} onChange={e => set(r.key, { endTime: e.target.value })} />{t.end.slice(0, 10) !== r.date && <small>+1 gün</small>}</td>
          <td><input type="number" min="0" max="600" value={r.breakMinutes} disabled={fixed} onChange={e => set(r.key, { breakMinutes: e.target.value })} /></td>
          <td className="net">{instant(t.end) > instant(t.start) ? durationText(netHours(t)) : '—'}</td>
          <td><select value={r.personId} onChange={e => set(r.key, { personId: e.target.value })}><option value="">Personel seçin</option>{people.map((p: any) => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}</select>{problem && <small>{problem}</small>}</td>
          <td className="row-actions"><button className="icon-button" aria-label="Satırı çoğalt" title="Satırı çoğalt" onClick={() => { const i = rows.findIndex(x => x.key === r.key); const c = [...rows]; c.splice(i + 1, 0, { ...r, key: ++rowKey, personId: '' }); setRows(c); }}><Copy size={15} /></button><button className="icon-button" aria-label="Satırı sil" onClick={() => setRows(rows.filter(x => x.key !== r.key))}><Trash2 size={15} /></button></td>
        </tr>; })}
      </tbody></table></div> : <div className="empty"><strong>Henüz satır yok.</strong><span>Kişileri sabitleyip günleri seçin, son günü kopyalayın veya Excel'den doldurun.</span></div>}
      {(localError || error) && <div className="alert danger" role="alert" style={{ whiteSpace: 'pre-line' }}>{localError || error}</div>}
    </div>
    <div className="modal-footer"><span className="muted">{filled.length} satır · {groupsCount} destek kaydı oluşacak. Tek satırda hata varsa hiçbiri kaydedilmez.</span><div className="detail-buttons">{rows.length > 0 && <button className="button" onClick={() => setRows([])}>Satırları temizle</button>}<button className="button" onClick={onClose}>Vazgeç</button><button className="button primary" disabled={busy || !filled.length} onClick={submit}>Onaya gönder</button></div></div>
  </section></div>;
}
