// Hiyerarşi filtresi: bir üst düzey (ör. Müdürlük) ve o düzeyden birimler seçilir; altındaki 1. düzey birimler süzülür.
import React from 'react';
import DeptPicker from './dept-picker';
import { levels, unitsOf, plural, deptsUnder } from '../lib/org.mjs';

export const orgDeptSet = (s: any, org: any) => org.level > 1 && org.ids.length ? new Set(deptsUnder(s, org.level, org.ids)) : null;

export default function OrgFilter({ s, value, onChange }: any) {
  const lv = levels(s);
  if (lv.length < 2) return null;
  const level = value.level > 1 ? value.level : 2;
  return <>
    <label>Hiyerarşi<select value={level} onChange={e => onChange({ level: +e.target.value, ids: [] })}>{lv.slice(1).map((n: string, i: number) => <option key={i} value={i + 2}>{n}</option>)}</select></label>
    <DeptPicker label={lv[level - 1]} allText={'Tüm ' + plural(lv[level - 1]).toLocaleLowerCase('tr')} departments={unitsOf(s, level)} locations={[]} value={value.ids} onChange={(ids: string[]) => onChange({ level, ids })} />
  </>;
}
