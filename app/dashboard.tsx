// Dashboard ekranı: destek kaydı ve kişi sayıları; uyumsuz destek paneli kullanıcı isterse açılır.
// Hesaplar lib/dashboard.mjs içinde; bu dosya yalnızca gösterir. Saat veya adam-saat gösterilmez.
import React, { useMemo, useState } from 'react';
import { Download, TriangleAlert, ArrowUpRight } from 'lucide-react';
import { dashboard, autoGrain, analytics } from '../lib/dashboard.mjs';
import { access, addDays, today } from '../lib/domain.mjs';
import DeptPicker from './dept-picker';
import OrgFilter, { orgDeptSet } from './org-filter';
import { levels, plural, lower, rollup, ancestorAt } from '../lib/org.mjs';

const fmt = (x: number, d = 0) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d }).format(x);
const pct = (x: number | null) => x == null ? '—' : '%' + fmt(x * 100, 1);
const C = { final: '#1f7a64', pending: '#a9d4c3', grid: '#e8eeea', muted: '#9aa8a0' };
const readPref = () => { try { return localStorage.getItem('destek.dashboard.mismatch') === '1'; } catch { return false; } };
const writePref = (v: boolean) => { try { localStorage.setItem('destek.dashboard.mismatch', v ? '1' : '0'); } catch { /* izin yoksa yalnızca bu oturumda kalır */ } };
const codeName: any = { absent: 'İşe gelmediği gün', outside: 'Puantaj saatleri dışında', exceeds: 'Çalışma süresini aşan', shift: 'Farklı vardiya' };

function niceStep(max: number) { const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))); const s = [1, 2, 2.5, 5, 10].map(m => m * p).find(x => x >= raw) || p * 10; return Math.max(1, Math.ceil(s)); }

// Yığılmış çubuk: kesinleşen (koyu) + onay bekleyen (açık) destek kaydı sayısı. Üzerine gelince ayrıntı görünür.
function CountBars({ series }: any) {
  const W = 760, H = 220, L = 40, B = 28, T = 10, plotW = W - L - 8, plotH = H - B - T;
  const max = Math.max(1, ...series.map((x: any) => x.final + x.pending));
  const step = niceStep(max), top = Math.ceil(max / step) * step;
  const slot = plotW / series.length, bw = Math.max(3, Math.min(28, slot * 0.62));
  const y = (v: number) => T + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(series.length / 10);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover == null ? null : series[hover];
  return <div className="chart-wrap"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Döneme göre destek kaydı sayısı" className="chart">
    {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map(v => <g key={v}><line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} stroke={C.grid} /><text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill={C.muted}>{fmt(v)}</text></g>)}
    {series.map((p: any, i: number) => {
      const x = L + slot * i + (slot - bw) / 2, a = p.final, q = p.pending, ya = y(a), yq = y(a + q);
      return <g key={p.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
        <rect x={L + slot * i} y={T} width={slot} height={plotH} fill={hover === i ? '#f3f7f5' : 'transparent'} />
        {a > 0 && <rect x={x} y={ya} width={bw} height={y(0) - ya} fill={C.final} rx={q > 0 ? 0 : 3} />}
        {q > 0 && <rect x={x} y={yq} width={bw} height={Math.max(0, ya - yq - 2)} fill={C.pending} rx={3} />}
        {i % labelEvery === 0 && <text x={L + slot * i + slot / 2} y={H - 9} textAnchor="middle" fontSize="10" fill={C.muted}>{p.label.split('–')[0]}</text>}
      </g>;
    })}
  </svg>
    {h && <div className="chart-tip"><strong>{h.label}</strong><span><i style={{ background: C.final }} />Kesinleşen {h.final}</span><span><i style={{ background: C.pending }} />Onay bekleyen {h.pending}</span><span>Planlanan {h.planned} · Reddedilen {h.rejected} · İptal {h.cancelled}</span><span>Destek veren kişi {h.people}</span></div>}
  </div>;
}

// Yatay çubuklar: tek seri, değer çubuğun yanında yazılı.
function HBars({ rows, unit = '' }: any) {
  const max = Math.max(1, ...rows.map((r: any) => r.value));
  return <div className="hbars">{rows.map((r: any) => <div className="hbar" key={r.label} title={r.label + ': ' + fmt(r.value, 1) + unit}><span className="hbar-label">{r.label}{r.sub && <small>{r.sub}</small>}</span><span className="hbar-track"><i style={{ width: (r.value / max * 100) + '%' }} /></span><b>{fmt(r.value, 1)}{unit}</b></div>)}</div>;
}

// Gün × bölüm ısı haritası: renk koyulaştıkça o gün daha çok destek kaydı var.
function Heatmap({ heat, mode, deptName, limit, G = 'Bölüm' }: any) {
  const total = (r: any) => r[mode].reduce((a: number, b: number) => a + b, 0);
  const all = [...heat.rows].sort((a: any, b: any) => total(b) - total(a));
  heat = { ...heat, rows: all.slice(0, limit) };
  const hidden = all.length - heat.rows.length;
  const values = heat.rows.flatMap((r: any) => r[mode]);
  const max = Math.max(1, ...values);
  const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return <div className="table-scroll"><table className="heatmap"><thead><tr><th />{heat.days.map((d: string) => { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); return <th key={d} className={wd === 1 ? 'week-start' : ''} title={d}>{+d.slice(8)}{(+d.slice(8) === 1 || d === heat.days[0]) && <small>{MONTHS[+d.slice(5, 7) - 1]}</small>}</th>; })}<th>TOPLAM</th></tr></thead>
    <tbody>{heat.rows.map((r: any) => <tr key={r.deptId}><td><strong>{deptName(r.deptId)}</strong></td>{r[mode].map((v: number, i: number) => <td key={i} className={new Date(heat.days[i] + 'T00:00:00Z').getUTCDay() === 1 ? 'week-start' : ''} title={deptName(r.deptId) + ' · ' + heat.days[i] + ': ' + v + ' kayıt'} style={{ background: v ? `rgba(31,122,100,${0.12 + 0.68 * v / max})` : undefined, color: v / max > 0.6 ? '#fff' : undefined }}>{v || ''}</td>)}<td><strong>{r[mode].reduce((a: number, b: number) => a + b, 0)}</strong></td></tr>)}</tbody></table>{hidden > 0 && <p className="footnote">En yoğun {heat.rows.length} {lower(G)} gösteriliyor; {hidden} {lower(G)} gizli. "Gösterim" veya bölüm seçimiyle değiştirin.</p>}</div>;
}

// Çok bölümde matris okunmaz: en yoğun veren → alan akışları liste olarak gösterilir.
function FlowTable({ d, deptName, limit, G = 'Bölüm' }: any) {
  const pairs = Object.entries(d.matrix).flatMap(([f, row]: any) => Object.entries(row).map(([t, v]: any) => ({ f, t, v }))).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...pairs.map(p => p.v));
  return <div className="panel-pad"><div className="hbars">{pairs.slice(0, limit).map(p => <div className="hbar" key={p.f + p.t} title={deptName(p.f) + ' → ' + deptName(p.t) + ': ' + p.v + ' kayıt'}><span className="hbar-label">{deptName(p.f)} → {deptName(p.t)}</span><span className="hbar-track"><i style={{ width: (p.v / max * 100) + '%' }} /></span><b>{p.v}</b></div>)}</div>
    <p className="footnote">{d.matrixDepts.length} {lower(G)} arasında {pairs.length} farklı akış var; en yoğun {Math.min(limit, pairs.length)} tanesi gösteriliyor. Tamamı Excel'deki "Destek matrisi" sayfasında.</p></div>;
}

// Bölüm tablosu: arama, sıralama ve satır sınırı.
function DeptTable({ rows, deptName, q, sortKey, setSortKey, limit, G = 'Bölüm' }: any) {
  const cols = [['givenFinal', 'VERİLEN (KESİNLEŞEN)'], ['receivedFinal', 'ALINAN (KESİNLEŞEN)'], ['people', 'DESTEK VEREN KİŞİ'], ['pending', 'ONAY BEKLEYEN'], ['rejected', 'REDDEDİLEN'], ['cancelled', 'İPTAL']];
  const val = (x: any, k: string) => k === 'total' ? x.givenFinal + x.receivedFinal : x[k];
  const list = rows.filter((x: any) => !q || deptName(x.deptId).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))).sort((a: any, b: any) => val(b, sortKey) - val(a, sortKey));
  const shown = q ? list : list.slice(0, limit);
  return <><div className="table-scroll"><table className="sortable"><thead><tr><th>{G.toLocaleUpperCase('tr')}</th>{cols.map(([k, n]) => <th key={k} className={sortKey === k ? 'sorted' : ''} onClick={() => setSortKey(sortKey === k ? 'total' : k)}>{n}{sortKey === k ? ' ↓' : ''}</th>)}</tr></thead>
    <tbody>{shown.map((x: any) => <tr key={x.deptId}><td><strong>{deptName(x.deptId)}</strong></td><td>{x.givenFinal}</td><td className="teal-text">{x.receivedFinal}</td><td>{x.people}</td><td>{x.pending}</td><td>{x.rejected}</td><td>{x.cancelled}</td></tr>)}</tbody></table></div>
    {shown.length < list.length && <p className="footnote panel-pad">{shown.length} / {list.length} {lower(G)} gösteriliyor. Aramayla veya "Gösterim" seçeneğiyle diğerlerini görün.</p>}</>;
}

export default function Dashboard({ s, u, idx, deptName: baseDeptName, onOpenMismatches, download }: any) {
  const lv = levels(s), L1 = lv[0];
  const [org, setOrg] = useState({ level: 0, ids: [] as string[] }), [groupLevel, setGroupLevel] = useState(1);
  const G = lv[Math.min(groupLevel, lv.length) - 1];
  const [from, setFrom] = useState(addDays(today(), -27)), [to, setTo] = useState(today());
  const [grainSel, setGrainSel] = useState('auto'), [loc, setLoc] = useState('all'), [deptSel, setDeptSel] = useState<string[]>([]);
  // Büyük işletmede (ör. 50 bölüm) bölüm bazlı görseller en yoğun N bölümle sınırlanır.
  const [topN, setTopN] = useState(10), [tableQ, setTableQ] = useState(''), [sortKey, setSortKey] = useState('total');
  const [showMismatch, setShowMismatch] = useState(readPref);
  const [shiftSel, setShiftSel] = useState('all'), [heatMode, setHeatMode] = useState('received');
  const orgSet = orgDeptSet(s, org);
  const visibleDepts = s.departments.filter((d: any) => access(u, d.id) && (loc === 'all' || d.locationId === loc) && (!orgSet || orgSet.has(d.id)));
  const deptIds = deptSel.length ? deptSel.filter(id => visibleDepts.some((d: any) => d.id === id)) : visibleDepts.map((d: any) => d.id);
  const valid = from && to && from <= to;
  const grain = grainSel === 'auto' && valid ? autoGrain(from, to) : grainSel;
  // Vardiya filtresi kayıtları baştan süzer; tüm hesaplar süzülmüş kayıtlarla yapılır.
  const sx = useMemo(() => shiftSel === 'all' ? s : { ...s, supports: s.supports.filter((r: any) => shiftSel === 'none' ? !r.shiftId : r.shiftId === shiftSel) }, [s, shiftSel]);
  // Seçili 1. düzey birimlere dokunan kayıtlar alınır, sonra seçilen gruplama düzeyine toplanır.
  const level = Math.min(groupLevel, lv.length);
  const g: any = useMemo(() => { const ids = new Set(deptIds); return rollup({ ...sx, supports: sx.supports.filter((r: any) => ids.has(r.fromDept) || ids.has(r.toDept)) }, level); }, [sx, deptIds.join(','), level]);
  const gIds = level > 1 ? [...new Set(deptIds.map((id: string) => ancestorAt(s, id, level) ?? '__none__'))] : deptIds;
  const deptName = (id: string) => g.departments.find((x: any) => x.id === id)?.name ?? baseDeptName(id);
  const d: any = useMemo(() => valid && gIds.length ? dashboard(g, { from, to, deptIds: gIds, grain }, idx) : null, [g, from, to, gIds.join(','), grain, valid]);
  const an: any = useMemo(() => valid && gIds.length ? analytics(g, { from, to, deptIds: gIds }, idx) : null, [g, from, to, gIds.join(','), valid]);
  const personName = (id: string) => s.people.find((p: any) => p.id === id)?.name ?? id;
  const grainName: any = { day: 'gün', week: 'hafta', month: 'ay' };

  function exportXlsx() {
    const sheets: any = {
      'Özet': [{ 'Başlangıç': from, 'Bitiş': to, [plural(L1)]: deptIds.length === s.departments.length ? 'Tümü' : deptIds.map(baseDeptName).join(', '), 'Gruplama düzeyi': G, 'Toplam kayıt': d.kpi.total, 'Kesinleşen': d.kpi.final, 'Onay bekleyen': d.kpi.pending, 'Planlanan': d.kpi.planned, 'Reddedilen': d.count.rejected, 'İptal edilen': d.count.cancelled, 'Destek veren kişi': d.kpi.people, 'Ret oranı': d.kpi.rejectRate == null ? '' : Math.round(d.kpi.rejectRate * 10000) / 10000 }],
      'Dönemler': d.series.map((p: any) => ({ 'Dönem': p.label, 'Başlangıç': p.from, 'Bitiş': p.to, 'Toplam': p.total, 'Kesinleşen': p.final, 'Onay bekleyen': p.pending, 'Planlanan': p.planned, 'Reddedilen': p.rejected, 'İptal': p.cancelled, 'Destek veren kişi': p.people })),
      'Bölümler': d.byDept.map((x: any) => ({ 'Bölüm': deptName(x.deptId), 'Verilen (kesinleşen)': x.givenFinal, 'Alınan (kesinleşen)': x.receivedFinal, 'Destek veren kişi': x.people, 'Onay bekleyen': x.pending, 'Reddedilen': x.rejected, 'İptal': x.cancelled })),
      'Destek matrisi': d.matrixDepts.map((f: string) => Object.fromEntries([['Veren \\ Alan', deptName(f)], ...d.matrixDepts.map((t: string) => [deptName(t), d.matrix[f]?.[t] ?? 0])]))
    };
    if (showMismatch) sheets['Uyumsuz destek'] = [{ 'Kayıt': d.mismatch.count, 'İnceleme bekleyen': d.mismatch.open, 'Kişi': d.mismatch.people, ...Object.fromEntries(d.mismatch.byCode.map((c: any) => [codeName[c.code], c.count])) }];
    download('destek-dashboard-' + from + '_' + to + '.xlsx', sheets);
  }

  const matrixMax = d ? Math.max(1, ...d.matrixDepts.flatMap((f: string) => d.matrixDepts.map((t: string) => d.matrix[f]?.[t] ?? 0))) : 1;
  return <>
    <section className="panel dash-filters">
      <label>Başlangıç<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
      <label>Bitiş<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
      <label>Gruplama<select value={grainSel} onChange={e => setGrainSel(e.target.value)}><option value="auto">Otomatik ({grainName[valid ? autoGrain(from, to) : 'day']})</option><option value="day">Gün</option><option value="week">Hafta</option><option value="month">Ay</option></select></label>
      <label>Lokasyon<select value={loc} onChange={e => { setLoc(e.target.value); setDeptSel([]); }}><option value="all">Tüm lokasyonlar</option>{s.locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      {(s.shifts ?? []).length > 0 && <label>Vardiya<select value={shiftSel} onChange={e => setShiftSel(e.target.value)}><option value="all">Tüm vardiyalar</option>{s.shifts.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}<option value="none">Vardiyasız</option></select></label>}
      <OrgFilter s={s} value={org} onChange={(v: any) => { setOrg(v); setDeptSel([]); }} />
      <DeptPicker label={L1} allText={'Tüm ' + lower(plural(L1))} departments={visibleDepts} locations={s.locations} value={deptSel} onChange={setDeptSel} />
      {lv.length > 1 && <label>Gruplama düzeyi<select value={level} onChange={e => setGroupLevel(+e.target.value)}>{lv.map((n: string, i: number) => <option key={i} value={i + 1}>{n}</option>)}</select></label>}
      <label>Gösterim<select value={topN} onChange={e => setTopN(+e.target.value)}><option value={10}>En yoğun 10</option><option value={20}>En yoğun 20</option><option value={50}>En yoğun 50</option><option value={9999}>Tümü</option></select></label>
      <div className="dash-quick">{[[7, 'Son 7 gün'], [28, 'Son 4 hafta'], [90, 'Son 3 ay']].map(([n, t]: any) => <button key={n} className="button small" onClick={() => { setFrom(addDays(today(), -(n - 1))); setTo(today()); }}>{t}</button>)}</div>
      <label className="checkbox-line"><input type="checkbox" checked={showMismatch} onChange={e => { setShowMismatch(e.target.checked); writePref(e.target.checked); }} />Uyumsuz destekleri göster</label>
      <button className="button" disabled={!d} onClick={exportXlsx}><Download size={16} />Excel'e aktar</button>
    </section>
    {!d ? <section className="panel"><div className="empty"><strong>Geçerli bir tarih aralığı ve en az bir bölüm seçin.</strong></div></section> : <>
      <div className="stats dash-kpis">
        <div className="stat"><span>Kesinleşen destek</span><strong>{d.kpi.final}<em>kayıt</em></strong><small>Onaylı ve gerçekleşen · toplam {d.kpi.total} kayıt</small></div>
        <div className="stat"><span>Destek veren kişi</span><strong>{d.kpi.people}<em>kişi</em></strong><small>Kesinleşen desteklerde yer alan farklı personel</small></div>
        <div className="stat"><span>Onay bekleyen</span><strong>{d.kpi.pending}<em>kayıt</em></strong><small>Planlanan (onaylı, gerçekleşmemiş) {d.kpi.planned} kayıt</small></div>
        <div className="stat"><span>Ret oranı</span><strong>{pct(d.kpi.rejectRate)}</strong><small>Karar verilen kayıtlarda · {d.kpi.cancelled} kayıt geri çekildi/iptal</small></div>
      </div>
      <section className="panel"><div className="panel-head"><div><h2>Destek kayıtları</h2><p>{grainName[grain]} bazında · desteğin başladığı güne göre</p></div><div className="legend"><span><i style={{ background: C.final }} />Kesinleşen</span><span><i style={{ background: C.pending }} />Onay bekleyen</span></div></div><CountBars series={d.series} /></section>
      <section className="panel"><div className="panel-head"><div><h2>Kim kime destek verdi?</h2><p>Kesinleşen destek kaydı sayısı · satır veren, sütun alan {lower(G)}</p></div></div>
        {d.matrixDepts.length > 12 ? <FlowTable d={d} deptName={deptName} limit={Math.max(20, Math.min(topN, 100))} G={G} /> : d.matrixDepts.length ? <div className="table-scroll"><table className="matrix"><thead><tr><th>VEREN \ ALAN</th>{d.matrixDepts.map((t: string) => <th key={t}>{deptName(t)}</th>)}<th>TOPLAM</th></tr></thead><tbody>{d.matrixDepts.map((f: string) => { const row = d.matrix[f] ?? {}; const tot = Object.values(row).reduce((a: number, b: any) => a + b, 0) as number; return <tr key={f}><td><strong>{deptName(f)}</strong></td>{d.matrixDepts.map((t: string) => { const v = row[t] ?? 0; return <td key={t} title={deptName(f) + ' → ' + deptName(t) + ': ' + v + ' kayıt'} style={{ background: v ? `rgba(31,122,100,${0.08 + 0.5 * v / matrixMax})` : undefined }}>{f === t && !v ? '·' : v || ''}</td>; })}<td><strong>{tot}</strong></td></tr>; })}</tbody></table></div> : <div className="empty"><strong>Bu aralıkta kesinleşen destek yok.</strong></div>}
      </section>
      <section className="panel"><div className="panel-head"><div><h2>Takvim · gün ve {lower(G)}</h2><p>{heatMode === 'received' ? 'Alınan' : 'Verilen'} destek kaydı sayısı (ret ve iptal hariç) · çizgi haftanın başını gösterir</p></div><div className="seg"><button className={heatMode === 'received' ? 'selected' : ''} onClick={() => setHeatMode('received')}>Alınan</button><button className={heatMode === 'given' ? 'selected' : ''} onClick={() => setHeatMode('given')}>Verilen</button></div></div>
        {an.heat.days.length > 93 ? <div className="empty"><strong>Takvim en fazla 93 gün için gösterilir.</strong><span>Tarih aralığını daraltın.</span></div> : <Heatmap heat={an.heat} mode={heatMode} deptName={deptName} limit={topN} G={G} />}
      </section>
      <div className="dash-grid2">
        <section className="panel"><div className="panel-head"><div><h2>Vardiyaya göre</h2><p>Destek kaydı sayısı (ret ve iptal hariç)</p></div></div><div className="panel-pad"><HBars rows={an.shifts.map((x: any) => ({ label: x.name, value: x.total, sub: x.final + ' kesinleşen' }))} /></div></section>

        <section className="panel"><div className="panel-head"><div><h2>Giriş gecikmesi</h2><p>Destek gününden kaydın girilmesine kadar · ortalama {an.delay.average == null ? '—' : fmt(an.delay.average, 1)} gün, ortanca {an.delay.median == null ? '—' : fmt(an.delay.median, 1)} gün</p></div></div><div className="panel-pad"><HBars rows={an.delay.buckets.map((b: any) => ({ label: b.name, value: b.count }))} />{an.delay.byDept.some((x: any) => x.late) && (() => { const late = an.delay.byDept.filter((x: any) => x.late).sort((a: any, b: any) => b.late - a.late); return <p className="footnote">4 gün ve daha geç en çok giren: {late.slice(0, 5).map((x: any) => deptName(x.deptId) + ' ' + x.late).join(' · ')}{late.length > 5 ? ' · ve ' + (late.length - 5) + ' ' + lower(G) + ' daha (Giriş gecikmesi raporu)' : ''}</p>; })()}</div></section>
        <section className="panel"><div className="panel-head"><div><h2>Onay süresi</h2><p>Onaya gönderimden karara · ortalama {an.approval.averageHours == null ? '—' : fmt(an.approval.averageHours, 1)} saat · {an.approval.auto} sistem onayı · {an.approval.waiting} bekleyen</p></div></div><div className="panel-pad">{an.approval.byDept.length ? <HBars unit=" sa" rows={[...an.approval.byDept].sort((a: any, b: any) => b.count - a.count).slice(0, topN).map((x: any) => ({ label: deptName(x.deptId), value: x.averageHours ?? 0, sub: x.count + ' karar · ' + x.auto + ' sistem' }))} /> : <div className="empty"><strong>Karar verilmiş kayıt yok.</strong></div>}</div></section>
      </div>
      <section className="panel"><div className="panel-head"><div><h2>En çok destek veren personel</h2><p>Kesinleşen destek kaydı sayısı · ilk 10</p></div></div><div className="panel-pad">{an.persons.length ? <HBars rows={an.persons.slice(0, 10).map((p: any) => ({ label: personName(p.personId), value: p.count, sub: p.days + ' gün · ' + p.toDepts.slice(0, 3).map(deptName).join(', ') + (p.toDepts.length > 3 ? ' +' + (p.toDepts.length - 3) : '') }))} /> : <div className="empty"><strong>Kesinleşen destek yok.</strong></div>}</div></section>
      <section className="panel"><div className="panel-head"><div><h2>{G} bazında destek</h2><p>Seçili aralıkta başlayan destek kayıtları · başlığa tıklayıp sıralayın</p></div><label className="search small"><input placeholder={G + " ara…"} value={tableQ} onChange={e => setTableQ(e.target.value)} /></label></div>
        <DeptTable rows={d.byDept} deptName={deptName} q={tableQ} sortKey={sortKey} setSortKey={setSortKey} limit={topN} G={G} />{level > 1 && <p className="footnote panel-pad">Aynı {lower(G)} içindeki {lower(plural(L1))} arasındaki destek hem verilen hem alınan sayılır; matristeki köşegen bu iç desteği gösterir.</p>}
      </section>
      {showMismatch && <section className="panel"><div className="panel-head"><div><h2>Uyumsuz destek</h2><p>Seçili aralıkta puantajla çelişen, iptal edilmemiş destekler</p></div><button className="text-button" onClick={onOpenMismatches}>Uyumsuz destekler ekranı <ArrowUpRight size={15} /></button></div>
        <div className="stats three dash-mm"><div className="stat"><span>Uyumsuz kayıt</span><strong>{d.mismatch.count}<em>kayıt</em></strong><small>{d.mismatch.open} tanesi inceleme bekliyor</small></div><div className="stat"><span>İlgili personel</span><strong>{d.mismatch.people}<em>kişi</em></strong><small>Gerekirse kayıtları uyumsuz destekler ekranından iptal edin</small></div><div className="stat"><span>Türe göre</span><div className="mm-codes">{d.mismatch.byCode.map((c: any) => <span key={c.code}><TriangleAlert size={12} />{codeName[c.code]}: <b>{c.count}</b></span>)}</div></div></div>
      </section>}
    </>}
  </>;
}
