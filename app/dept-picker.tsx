// Çoklu bölüm seçici: arama, lokasyona göre hızlı seçim, tümünü seç/temizle. Boş seçim = tüm bölümler.
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export default function DeptPicker({ departments, locations, value, onChange, label = 'Bölüm', allText }: any) {
  const [open, setOpen] = useState(false), [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const selected = new Set<string>(value);
  const text = !value.length || value.length === departments.length ? (allText ?? 'Tümü') + ' (' + departments.length + ')' : value.length === 1 ? departments.find((d: any) => d.id === value[0])?.name ?? '1 seçili' : value.length + ' seçili';
  const shown = departments.filter((d: any) => !q || (d.name + ' ' + d.id).toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));
  const toggle = (id: string) => { const next = new Set(selected.size ? selected : []); next.has(id) ? next.delete(id) : next.add(id); onChange([...next]); };
  const usedLocations = locations.filter((l: any) => departments.some((d: any) => d.locationId === l.id));
  return <div className="dept-picker" ref={ref}>
    <label>{label}<button type="button" className="picker-button" onClick={() => setOpen(!open)}>{text}<ChevronDown size={14} /></button></label>
    {open && <div className="picker-panel">
      <div className="picker-search"><Search size={14} /><input autoFocus placeholder="Ara…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="picker-quick">
        <button type="button" onClick={() => onChange([])}>Tümü</button>
        {q && <button type="button" onClick={() => onChange([...new Set([...value, ...shown.map((d: any) => d.id)])])}>Bulunanları ekle ({shown.length})</button>}
        {usedLocations.length > 1 && usedLocations.map((l: any) => <button type="button" key={l.id} onClick={() => onChange(departments.filter((d: any) => d.locationId === l.id).map((d: any) => d.id))}>{l.name}</button>)}
      </div>
      <div className="picker-list">{shown.map((d: any) => <label key={d.id}><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} /><span>{d.name}</span><small>{d.id}</small></label>)}{!shown.length && <span className="muted">Eşleşen kayıt yok.</span>}</div>
      <div className="picker-foot"><span>{value.length ? value.length + ' seçili' : 'Seçim yok = tümü'}</span><button type="button" className="button small" onClick={() => setOpen(false)}>Tamam</button></div>
    </div>}
  </div>;
}
