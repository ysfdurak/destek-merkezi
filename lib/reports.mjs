// Rapor merkezi: hazır raporlar. Her rapor { title, sections: [{ title, note?, columns, rows }] } döndürür.
// Aynı çıktı ekranda tablo, Excel'de sayfa, yazdırmada (PDF) bölüm olarak gösterilir.
import { attendanceIndex, isActive, mismatches, netHours, durationText } from './domain.mjs';
import { dashboard, analytics, scopeSupports, supportClass } from './dashboard.mjs';
import { levels, levelName, rollup, ancestorAt, pathNames, plural, lower } from './org.mjs';

export const REPORTS = [
  { id: 'ozet', name: 'Dönem özeti', description: 'Kayıt sayıları, günlük dağılım ve vardiya' },
  { id: 'bolum', name: 'Birim raporu', description: 'Seçilen düzeyde (bölüm, müdürlük…) verilen/alınan destek ve veren–alan matrisi' },
  { id: 'uyumsuz', name: 'Uyumsuz destek raporu', description: 'Puantajla çelişen kayıtlar, türü ve durumu' },
  { id: 'personel', name: 'Personel raporu', description: 'Kim kaç kez, kaç gün, hangi bölümlere destek verdi' },
  { id: 'gecikme', name: 'Giriş gecikmesi ve onay süresi', description: 'Kayıtların kaç gün sonra girildiği, kaç saatte onaylandığı' },
  { id: 'liste', name: 'Destek kayıt listesi', description: 'Filtreye uyan tüm kayıtlar, ayrıntılı' }
];

const STATUS = { pending: 'Onay bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi', cancelled: 'İptal edildi' };
const CLASS = { final: 'Kesinleşen', pending: 'Onay bekliyor', planned: 'Planlanan', rejected: 'Reddedildi', cancelled: 'İptal edildi' };
const CODE = { absent: 'İşe gelmediği gün', outside: 'Puantaj saatleri dışında', exceeds: 'Çalışma süresini aşan', shift: 'Farklı vardiya' };
const r1 = x => x == null ? '' : Math.round(x * 10) / 10;
const pct = x => x == null ? '' : '%' + (Math.round(x * 1000) / 10).toLocaleString('tr-TR');

// filters: { from, to, deptIds (1. düzey), shiftId, groupLevel (1 = en alt düzey) }
export function buildReport(kind, base, filters, index = attendanceIndex(base)) {
  const level = Math.min(Math.max(1, Number(filters.groupLevel ?? 1)), levels(base).length);
  const G = levelName(base, level), U = levelName(base, 1);
  const baseDepts = filters.deptIds?.length ? filters.deptIds : base.departments.map(d => d.id);
  // Önce 1. düzey filtre uygulanır, sonra kayıtlar seçilen düzeye toplanır.
  const scoped = { ...base, supports: base.supports.filter(r => baseDepts.includes(r.fromDept) || baseDepts.includes(r.toDept)) };
  const s = rollup(scoped, level);
  filters = { ...filters, deptIds: [...new Set(baseDepts.map(id => level > 1 ? (ancestorAt(base, id, level) ?? '__none__') : id))] };
  const deptName = id => s.departments.find(d => d.id === id)?.name ?? id;
  const personName = id => s.people.find(p => p.id === id)?.name ?? id;
  const shiftName = id => s.shifts?.find(x => x.id === id)?.name ?? '';
  const depts = filters.deptIds?.length ? filters.deptIds : s.departments.map(d => d.id);
  const subtitle = [filters.from + ' – ' + filters.to, (baseDepts.length === base.departments.length ? 'Tüm ' + lower(plural(U)) : baseDepts.length <= 6 ? baseDepts.map(id => base.departments.find(d => d.id === id)?.name ?? id).join(', ') : baseDepts.length + ' ' + lower(U)) + (level > 1 ? ' · ' + G + ' düzeyinde' : ''), filters.shiftId && filters.shiftId !== 'all' ? (filters.shiftId === 'none' ? 'Vardiyasız' : shiftName(filters.shiftId) + ' vardiyası') : 'Tüm vardiyalar'].join(' · ');
  const list = scopeSupports(s, filters);
  const d = dashboard({ ...s, supports: list }, { from: filters.from, to: filters.to, deptIds: depts }, index);
  const a = analytics(s, filters, index);
  const title = kind === 'bolum' ? G + ' raporu' : REPORTS.find(r => r.id === kind)?.name ?? 'Rapor';
  const out = { kind, title, subtitle, sections: [] };
  const add = (title, columns, rows, note, sheet) => out.sections.push({ title, columns, rows, note, sheet: sheet ?? SHEET_NAMES[title] ?? title.slice(0, 31) });

  if (kind === 'ozet') {
    add('Özet', ['Gösterge', 'Değer'], [
      ['Toplam destek kaydı', d.kpi.total], ['Kesinleşen (onaylı ve gerçekleşen)', d.kpi.final], ['Onay bekleyen', d.kpi.pending],
      ['Planlanan', d.kpi.planned], ['Reddedilen', d.count.rejected], ['İptal / geri çekilen', d.count.cancelled],
      ['Destek veren kişi (kesinleşen)', d.kpi.people], ['Ret oranı', pct(d.kpi.rejectRate)],
      ['Uyumsuz destek (açık / toplam)', d.mismatch.open + ' / ' + d.mismatch.count],
      ['Ortalama giriş gecikmesi (gün)', r1(a.delay.average)], ['Ortalama onay süresi (saat)', r1(a.approval.averageHours)]
    ]);
    add('Güne göre', ['Tarih', 'Toplam', 'Kesinleşen', 'Onay bekleyen', 'Planlanan', 'Reddedilen', 'İptal', 'Destek veren kişi'],
      dashboard({ ...s, supports: list }, { from: filters.from, to: filters.to, deptIds: depts, grain: 'day' }, index).series.filter(p => p.total).map(p => [p.from, p.total, p.final, p.pending, p.planned, p.rejected, p.cancelled, p.people]));
    add('Vardiyaya göre', ['Vardiya', 'Kayıt (iptal/ret hariç)', 'Kesinleşen'], a.shifts.map(x => [x.name, x.total, x.final]));
  }
  if (kind === 'bolum') {
    add(G + ' bazında destek', [G, 'Verilen (kesinleşen)', 'Alınan (kesinleşen)', 'Destek veren kişi', 'Onay bekleyen', 'Reddedilen', 'İptal'],
      d.byDept.map(x => [deptName(x.deptId), x.givenFinal, x.receivedFinal, x.people, x.pending, x.rejected, x.cancelled]),
      level > 1 ? 'Aynı ' + lower(G) + ' içindeki ' + lower(plural(U)) + ' arasındaki destek hem verilen hem alınan olarak sayılır.' : undefined, plural(G).slice(0, 31));
    add('Veren → alan (kesinleşen kayıt)', ['Veren \\ Alan', ...d.matrixDepts.map(deptName), 'Toplam'],
      d.matrixDepts.map(f => { const row = d.matrixDepts.map(t => d.matrix[f]?.[t] ?? 0); return [deptName(f), ...row, row.reduce((x, y) => x + y, 0)]; }));
    add('Uyumsuz destek (' + lower(G) + ' bazında)', [G, 'Uyumsuz kayıt'], d.mismatch.byDept.map(x => [deptName(x.deptId), x.count]), undefined, 'Uyumsuz - ' + lower(G).slice(0, 20));
  }
  if (kind === 'uyumsuz') {
    const rows = list.map(r => ({ r, m: mismatches(s, r, index) })).filter(x => x.m.length || (x.r.status === 'cancelled' && x.r.cancelKind === 'mismatch'));
    add('Türe göre', ['Uyumsuzluk türü', 'Kayıt'], Object.entries(CODE).map(([k, n]) => [n, rows.filter(x => isActive(x.r) && x.m.some(i => i.code === k)).length]));
    add('Kayıtlar', ['Kayıt', 'Tarih', 'Vardiya', 'Veren', 'Alan', 'Personel', 'Uyumsuzluk', 'Durum', 'İnceleme / iptal notu'],
      rows.map(({ r, m }) => [r.code, r.start.replace('T', ' ') + '–' + r.end.slice(11), shiftName(r.shiftId), deptName(r.fromDept), deptName(r.toDept), r.personIds.map(personName).join(', '),
        m.map(i => i.name + ': ' + i.message).join(' | '), r.status === 'cancelled' ? 'İptal edildi' : r.issueResolved ? 'İncelendi · ' + STATUS[r.status] : 'Açık · ' + STATUS[r.status], r.cancelReason || r.issueNote || '']),
      'Açık: incelenmemiş. İncelendi: açıklama yazılıp kabul edilmiş.');
  }
  if (kind === 'personel') {
    add('Personel bazında kesinleşen destek', ['Personel', 'Sicil', 'Bağlı ' + lower(G), 'Destek kaydı', 'Destek günü', 'Destek verdiği bölümler', 'Uyumsuz kayıt'],
      a.persons.map(p => { const pr = s.people.find(x => x.id === p.personId); return [pr?.name ?? p.personId, pr?.code ?? '', deptName(pr?.deptId), p.count, p.days, p.toDepts.map(deptName).join(', '), p.mismatches]; }));
  }
  if (kind === 'gecikme') {
    add('Giriş gecikmesi (desteğin günü → kaydın girildiği gün)', ['Gecikme', 'Kayıt', 'Pay'], a.delay.buckets.map(b => [b.name, b.count, pct(a.delay.count ? b.count / a.delay.count : null)]),
      'Ortalama ' + r1(a.delay.average) + ' gün, ortanca ' + r1(a.delay.median) + ' gün. Planlanan kayıtlar hariç.');
    add(G + ' bazında giriş gecikmesi', ['Veren ' + lower(G), 'Kayıt', 'Ortalama (gün)', 'Ortanca (gün)', '4 gün ve üzeri'], a.delay.byDept.map(x => [deptName(x.deptId), x.count, r1(x.average), r1(x.median), x.late]), undefined, 'Gecikme - ' + lower(G).slice(0, 20));
    add(G + ' bazında onay süresi', ['Alan ' + lower(G), 'Karar verilen', 'Sistem onayı', 'Ortalama (saat)', 'Ortanca (saat)'], a.approval.byDept.map(x => [deptName(x.deptId), x.count, x.auto, r1(x.averageHours), r1(x.medianHours)]),
      'Süre, onaya gönderimden karara kadardır; sistem onayları ortalamaya katılmaz. Şu an ' + a.approval.waiting + ' kayıt onay bekliyor.', 'Onay süresi');
  }
  if (kind === 'liste') {
    // Liste her zaman 1. düzey kayıtlarla verilir; üst düzeyler ayrı sütunlarda.
    const upper = levels(base).slice(1).map((n, i) => ({ level: i + 2, name: n }));
    const bName = id => base.departments.find(d => d.id === id)?.name ?? id;
    const rows = scopeSupports(base, { ...filters, deptIds: baseDepts });
    add('Destek kayıtları', ['Kayıt', 'Başlangıç', 'Bitiş', 'Vardiya', 'Veren ' + lower(U), ...upper.map(x => 'Veren ' + lower(x.name)), 'Alan ' + lower(U), ...upper.map(x => 'Alan ' + lower(x.name)), 'Personel', 'Kişi', 'Mola (dk)', 'Net süre (kişi başı)', 'Tür', 'Durum', 'Sınıf', 'Girildi', 'Karar', 'Gerekçe / not'],
      rows.map(r => { const pf = pathNames(base, r.fromDept), pt = pathNames(base, r.toDept); return [r.code, r.start.replace('T', ' '), r.end.replace('T', ' '), shiftName(r.shiftId), bName(r.fromDept), ...upper.map(x => pf[x.level]), bName(r.toDept), ...upper.map(x => pt[x.level]), r.personIds.map(personName).join(', '), r.personIds.length, r.breakMinutes, durationText(netHours(r)),
        r.realized ? 'Gerçekleşen' : 'Planlanan', STATUS[r.status], CLASS[supportClass(base, r, index)], (r.createdAt ?? '').slice(0, 10), r.status === 'cancelled' ? (r.cancelledBy ?? '') : (r.decidedBy ?? ''), r.reason || r.cancelReason || r.note || '']; }), undefined, 'Kayıt listesi');
  }
  return out;
}

// Excel sayfa adları (en fazla 31 karakter)
export const SHEET_NAMES = {
  'Özet': 'Özet', 'Güne göre': 'Günlük', 'Vardiyaya göre': 'Vardiya',
  'Bölüm bazında destek': 'Bölümler', 'Veren → alan (kesinleşen kayıt)': 'Veren-alan matrisi', 'Uyumsuz destek (bölüme göre)': 'Uyumsuz - bölüm',
  'Türe göre': 'Uyumsuz - tür', 'Kayıtlar': 'Uyumsuz kayıtlar', 'Personel bazında kesinleşen destek': 'Personel',
  'Giriş gecikmesi (desteğin günü → kaydın girildiği gün)': 'Giriş gecikmesi', 'Bölüme göre giriş gecikmesi': 'Gecikme - bölüm',
  'Bölüme göre onay süresi': 'Onay süresi', 'Destek kayıtları': 'Kayıt listesi'
};

export const buildAll = (s, filters, index = attendanceIndex(s)) => REPORTS.map(r => buildReport(r.id, s, filters, index));
