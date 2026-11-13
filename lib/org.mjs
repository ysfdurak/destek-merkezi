// Çok düzeyli organizasyon hiyerarşisi.
// Düzeyler ayarlarda tutulur: orgLevels = ['Takım', 'Bölüm', 'Müdürlük'] gibi; 1. düzey en alttır.
// 1. düzey birimler mevcut "departments" kayıtlarıdır (personel buraya bağlıdır, destek bunlar arasında akar).
// 2. ve üstü düzeyler "orgUnits" içindedir: { id, name, level, parentId }. Her birim bir üst düzeydeki birime bağlanabilir.
export const MAX_LEVELS = 6;
export const NONE = '__none__';

export const levels = s => (s.settings?.orgLevels?.length ? s.settings.orgLevels : ['Bölüm']);
export const levelName = (s, level) => levels(s)[level - 1] ?? 'Düzey ' + level;

// Türkçe çoğul: son ünlüye göre -lar / -ler (Bölüm → Bölümler, Takım → Takımlar).
export function plural(name) {
  const v = [...String(name).toLocaleLowerCase('tr')].reverse().find(c => 'aeıioöuü'.includes(c));
  return name + ('aıou'.includes(v) ? 'lar' : 'ler');
}
export const lower = text => String(text).toLocaleLowerCase('tr');

export function unitsOf(s, level) {
  return level === 1 ? s.departments : (s.orgUnits ?? []).filter(u => u.level === level);
}
const unitById = (s, id) => (s.orgUnits ?? []).find(u => u.id === id);

// Bir 1. düzey birimin (departman) istenen düzeydeki üst birimi. Bağlantı yoksa null.
export function ancestorAt(s, deptId, level) {
  if (level === 1) return deptId;
  const dept = s.departments.find(d => d.id === deptId);
  let unit = dept?.parentId ? unitById(s, dept.parentId) : null;
  while (unit && unit.level < level) unit = unit.parentId ? unitById(s, unit.parentId) : null;
  return unit && unit.level === level ? unit.id : null;
}

// Seçilen düzeydeki birimlerin altındaki 1. düzey birimler.
export function deptsUnder(s, level, unitIds) {
  const set = new Set(unitIds);
  return s.departments.filter(d => set.has(ancestorAt(s, d.id, level) ?? NONE)).map(d => d.id);
}

// Bir departmanın bütün üst birimlerinin adları: { 2: 'Depo Müdürlüğü', 3: 'Lojistik Direktörlüğü' }
export function pathNames(s, deptId) {
  const out = {};
  for (let level = 2; level <= levels(s).length; level++) {
    const id = ancestorAt(s, deptId, level);
    out[level] = id ? unitById(s, id)?.name ?? id : '';
  }
  return out;
}

// Durumu seçilen düzeye "toplar": birimler o düzeyin birimleri olur, destek ve personel o düzeye eşlenir.
// Böylece dashboard ve raporların bütün hesapları değişmeden müdürlük/direktörlük düzeyinde çalışır.
// Üst birimi tanımlanmamış departmanlar "Atanmamış" grubunda toplanır.
export function rollup(s, level) {
  if (level <= 1) return s;
  const map = id => ancestorAt(s, id, level) ?? NONE;
  const units = unitsOf(s, level).map(u => ({ id: u.id, name: u.name, locationId: null, active: u.active !== false }));
  const used = new Set(s.departments.map(d => map(d.id)));
  if (used.has(NONE)) units.push({ id: NONE, name: 'Atanmamış', locationId: null, active: true });
  return {
    ...s,
    departments: units.filter(u => used.has(u.id)),
    people: s.people.map(p => ({ ...p, deptId: map(p.deptId), deptHistory: (p.deptHistory ?? []).map(h => ({ ...h, deptId: map(h.deptId) })) })),
    supports: s.supports.map(r => ({ ...r, fromDept: map(r.fromDept), toDept: map(r.toDept) }))
  };
}
