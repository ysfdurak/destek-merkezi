// Rapor merkezi: hazır raporları seçilen filtreyle üretir; ekranda önizler, Excel'e aktarır veya yazdırır (PDF olarak kaydedilebilir).
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, FileSpreadsheet, Files } from 'lucide-react';
import { REPORTS, buildReport, buildAll, SHEET_NAMES } from '../lib/reports.mjs';
import { access, addDays, today } from '../lib/domain.mjs';
import DeptPicker from './dept-picker';
import OrgFilter, { orgDeptSet } from './org-filter';
import { levels, plural, lower } from '../lib/org.mjs';

function ReportView({ report }: any) {
  return <div className="report-doc">
    <h2>{report.title}</h2><p className="report-sub">{report.subtitle}</p>
    {report.sections.map((sec: any) => <section key={sec.title} className="report-section">
      <h3>{sec.title}</h3>
      {sec.rows.length ? <div className="table-scroll"><table><thead><tr>{sec.columns.map((c: string) => <th key={c}>{c}</th>)}</tr></thead><tbody>{sec.rows.map((r: any[], i: number) => <tr key={i}>{r.map((v, j) => <td key={j}>{typeof v === 'number' ? v.toLocaleString('tr-TR') : String(v ?? '')}</td>)}</tr>)}</tbody></table></div> : <p className="muted">Bu bölümde kayıt yok.</p>}
      {sec.note && <p className="footnote">{sec.note}</p>}
    </section>)}
  </div>;
}

// Excel: her bölüm ayrı sayfa. Sayfa adları en fazla 31 karakter ve benzersiz olmalı.
function toSheets(reports: any[]) {
  const sheets: any = {}, used = new Set<string>();
  for (const r of reports) for (const sec of r.sections) {
    let name = (sec.sheet ?? (SHEET_NAMES as any)[sec.title] ?? sec.title).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    for (let i = 2; used.has(name); i++) name = name.slice(0, 28) + ' ' + i;
    used.add(name);
    sheets[name] = sec.rows.map((row: any[]) => Object.fromEntries(sec.columns.map((c: string, i: number) => [c, row[i]])));
  }
  return sheets;
}

export default function ReportCenter({ s, u, idx, download }: any) {
  const [from, setFrom] = useState(addDays(today(), -6)), [to, setTo] = useState(today());
  const [loc, setLoc] = useState('all'), [deptSel, setDeptSel] = useState<string[]>([]), [shift, setShift] = useState('all');
  const [kind, setKind] = useState('ozet'), [printing, setPrinting] = useState<any[] | null>(null);
  const lv = levels(s), [org, setOrg] = useState({ level: 0, ids: [] as string[] }), [groupLevel, setGroupLevel] = useState(1);
  const orgSet = orgDeptSet(s, org);
  const visible = s.departments.filter((d: any) => access(u, d.id) && (loc === 'all' || d.locationId === loc) && (!orgSet || orgSet.has(d.id)));
  const filters = { from, to, deptIds: deptSel.length ? deptSel.filter(id => visible.some((d: any) => d.id === id)) : visible.map((d: any) => d.id), shiftId: shift, groupLevel: Math.min(groupLevel, lv.length) };
  const valid = from && to && from <= to && filters.deptIds.length > 0;
  const report = useMemo(() => valid ? buildReport(kind, s, filters, idx) : null, [s, kind, from, to, loc, deptSel.join(','), shift, org.level, org.ids.join(','), groupLevel]);
  const stamp = from + '_' + to;

  function print(reports: any[]) {
    setPrinting(reports);
    // Yazdırma görünümü çizildikten sonra tarayıcının yazdır penceresi açılır; "PDF olarak kaydet" seçilebilir.
    setTimeout(() => { window.print(); setPrinting(null); }, 150);
  }
  return <>
    <section className="panel dash-filters">
      <label>Başlangıç<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
      <label>Bitiş<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
      <label>Lokasyon<select value={loc} onChange={e => { setLoc(e.target.value); setDeptSel([]); }}><option value="all">Tüm lokasyonlar</option>{s.locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <OrgFilter s={s} value={org} onChange={(v: any) => { setOrg(v); setDeptSel([]); }} />
      <DeptPicker label={lv[0]} allText={'Tüm ' + lower(plural(lv[0]))} departments={visible} locations={s.locations} value={deptSel} onChange={setDeptSel} />
      {lv.length > 1 && <label>Gruplama düzeyi<select value={Math.min(groupLevel, lv.length)} onChange={e => setGroupLevel(+e.target.value)}>{lv.map((n: string, i: number) => <option key={i} value={i + 1}>{n}</option>)}</select></label>}
      {(s.shifts ?? []).length > 0 && <label>Vardiya<select value={shift} onChange={e => setShift(e.target.value)}><option value="all">Tüm vardiyalar</option>{s.shifts.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}<option value="none">Vardiyasız</option></select></label>}
      <div className="dash-quick">{[[7, 'Son 7 gün'], [30, 'Son 30 gün']].map(([n, t]: any) => <button key={n} className="button small" onClick={() => { setFrom(addDays(today(), -(n - 1))); setTo(today()); }}>{t}</button>)}<button className="button small" onClick={() => { const t = today(); setFrom(t.slice(0, 8) + '01'); setTo(t); }}>Bu ay</button></div>
    </section>
    <div className="report-cards">{REPORTS.map(r => <button key={r.id} className={'report-card' + (kind === r.id ? ' selected' : '')} onClick={() => setKind(r.id)}><FileSpreadsheet size={18} /><strong>{r.name}</strong><span>{r.description}</span></button>)}</div>
    <section className="panel">
      <div className="panel-head"><div><h2>Önizleme</h2><p>Seçili rapor, yukarıdaki filtrelerle</p></div>
        <div className="detail-buttons">
          <button className="button" disabled={!report} onClick={() => download('rapor-' + kind + '-' + stamp + '.xlsx', toSheets([report]))}><Download size={15} />Excel</button>
          <button className="button" disabled={!report} onClick={() => print([report])}><Printer size={15} />Yazdır / PDF</button>
          <button className="button primary" disabled={!valid} onClick={() => download('destek-raporlari-' + stamp + '.xlsx', toSheets(buildAll(s, filters, idx)))}><Files size={15} />Tümü tek Excel</button>
          <button className="button" disabled={!valid} onClick={() => print(buildAll(s, filters, idx))}><Printer size={15} />Tümünü yazdır</button>
        </div></div>
      <div className="panel-pad">{report ? <ReportView report={report} /> : <div className="empty"><strong>Geçerli bir tarih aralığı ve bölüm seçin.</strong></div>}</div>
    </section>
    {printing && createPortal(<div className="print-root"><div className="print-head"><strong>Destek Merkezi</strong><span>Oluşturma: {new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })} · {u.name}</span></div>{printing.map((r: any) => <ReportView key={r.kind} report={r} />)}</div>, document.body)}
  </>;
}
