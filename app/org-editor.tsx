// Tanımlar → Hiyerarşi: düzeylerin adları ve sayısı, üst düzey birimleri, ağaç görünümü.
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save, ChevronRight } from 'lucide-react';
import { levels, MAX_LEVELS, plural, lower, unitsOf } from '../lib/org.mjs';

export default function OrgEditor({ s, busy, action, open }: any) {
  const current = levels(s);
  const [names, setNames] = useState<string[]>(current);
  useEffect(() => setNames(levels(s)), [s.settings]);
  const changed = JSON.stringify(names) !== JSON.stringify(current);
  const units = (level: number) => unitsOf(s, level);
  const unitName = (id: string) => (s.orgUnits ?? []).find((u: any) => u.id === id)?.name ?? '—';
  const childCount = (u: any) => u.level === 2 ? s.departments.filter((d: any) => d.parentId === u.id).length : (s.orgUnits ?? []).filter((x: any) => x.parentId === u.id).length;

  // Ağaç: en üst düzeyden aşağı
  function Tree({ level, parentId }: any): any {
    const items = level === 1 ? s.departments.filter((d: any) => (d.parentId ?? null) === parentId) : units(level).filter((u: any) => (u.parentId ?? null) === parentId);
    if (!items.length) return null;
    return <ul className="org-tree">{items.map((u: any) => <li key={u.id}><span><ChevronRight size={12} />{u.name}<small>{level === 1 ? current[0] : current[level - 1]}</small></span>{level > 1 && <Tree level={level - 1} parentId={u.id} />}</li>)}</ul>;
  }
  const top = current.length;
  const orphanLevels = current.map((_, i) => i + 1).filter(l => l < top && (l === 1 ? s.departments.some((d: any) => !d.parentId) : units(l).some((u: any) => !u.parentId)));

  return <>
    <section className="panel">
      <div className="panel-head"><div><h2>Hiyerarşi düzeyleri</h2><p>En alttan üste doğru adlandırın. 1. düzey personelin bağlı olduğu ve desteğin aktığı birimdir. En fazla {MAX_LEVELS} düzey.</p></div>
        <button className="button primary" disabled={busy || !changed} onClick={() => action('orgLevels', { levels: names }, 'Hiyerarşi düzeyleri kaydedildi.')}><Save size={15} />Düzeyleri kaydet</button></div>
      <div className="panel-pad org-levels">
        {names.map((n, i) => <div className="org-level" key={i}><span className="org-level-no">{i + 1}. düzey{i === 0 ? ' (en alt)' : i === names.length - 1 ? ' (en üst)' : ''}</span><input value={n} maxLength={40} onChange={e => setNames(names.map((x, j) => j === i ? e.target.value : x))} placeholder={['Bölüm', 'Müdürlük', 'Direktörlük', 'Genel Müdürlük'][i] ?? 'Düzey adı'} />
          {i > 0 && i === names.length - 1 && <button className="icon-button" aria-label="Düzeyi kaldır" disabled={units(i + 1).length > 0} title={units(i + 1).length ? 'Bu düzeyde birim var' : 'Düzeyi kaldır'} onClick={() => setNames(names.slice(0, -1))}><Trash2 size={15} /></button>}</div>)}
        {names.length < MAX_LEVELS && <button className="button small" onClick={() => setNames([...names, ''])}><Plus size={14} />Üst düzey ekle</button>}
        <p className="footnote">Örnek: "Takım → Bölüm → Müdürlük" veya "Bölüm → Müdürlük → Direktörlük". Adlar ekranlarda, filtrelerde ve raporlarda kullanılır.</p>
      </div>
    </section>
    {current.slice(1).map((name, i) => { const level = i + 2, list = units(level), parentName = current[level]; return <section className="panel" key={level}>
      <div className="panel-head"><div><h2>{plural(name)}</h2><p>{level}. düzey · {list.length} birim{parentName ? ' · üst düzey: ' + parentName : ''}</p></div>
        <button className="button primary" onClick={() => open('definition', { kind: 'orgUnits', value: { name: '', code: '', level, parentId: '', active: true } })}><Plus size={16} />Yeni {lower(name)}</button></div>
      {list.length ? <div className="table-scroll"><table><thead><tr><th>AD</th><th>KOD</th>{parentName && <th>BAĞLI OLDUĞU {parentName.toLocaleUpperCase('tr')}</th>}<th>ALT BİRİM</th><th /></tr></thead><tbody>{list.map((u: any) => <tr key={u.id}><td><strong>{u.name}</strong></td><td>{u.id}</td>{parentName && <td>{u.parentId ? unitName(u.parentId) : <span className="orange">Bağlı değil</span>}</td>}<td>{childCount(u)} {lower(current[level - 2])}</td><td className="row-actions"><button className="button small" onClick={() => open('definition', { kind: 'orgUnits', value: u })}>Düzenle</button><button className="icon-button" aria-label="Sil" disabled={busy || childCount(u) > 0} title={childCount(u) ? 'Önce bağlı birimleri başka birime taşıyın' : 'Sil'} onClick={() => action('deleteOrgUnit', { id: u.id }, 'Birim silindi.')}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
        : <div className="empty"><strong>Henüz {lower(name)} tanımlı değil.</strong><span>"{'Yeni ' + lower(name)}" ile ekleyin; sonra {lower(plural(current[level - 2]))} düzenlenirken bağlayın.</span></div>}
    </section>; })}
    {current.length > 1 && <section className="panel"><div className="panel-head"><div><h2>Ağaç görünümü</h2><p>{current.slice().reverse().join(' → ')}</p></div></div>
      <div className="panel-pad"><Tree level={top} parentId={null} />{orphanLevels.length > 0 && <p className="footnote orange">Üst birime bağlanmamış kayıtlar var ({orphanLevels.map(l => plural(current[l - 1])).join(', ')}). Raporlarda "Atanmamış" grubunda görünürler.</p>}</div></section>}
  </>;
}
