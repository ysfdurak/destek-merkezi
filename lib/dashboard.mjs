// Dashboard hesapları: destek kaydı ve kişi sayıları, bölümler arası destek matrisi ve (isteğe bağlı) uyumsuz destek özeti.
// Saat veya adam-saat hesabı yapılmaz. Tarayıcıda çalışır; ileride MCP aracı da aynı fonksiyonu çağırabilir.
import { addDays, attendanceIndex, counted, isActive, mismatches, today as localDay } from './domain.mjs';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const dayLabel = d => +d.slice(8) + ' ' + MONTHS[+d.slice(5, 7) - 1];
const weekStart = d => { const w = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; return addDays(d, -w); };

// Seçili aralığı gün, hafta (pazartesi başlar) veya ay dilimlerine böler.
export function periods(from, to, grain) {
  const out = [];
  let d = from;
  while (d <= to) {
    let end;
    if (grain === 'day') end = d;
    else if (grain === 'week') end = addDays(weekStart(d), 6);
    else { const [y, m] = d.split('-').map(Number); end = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1); }
    if (end > to) end = to;
    const label = grain === 'day' ? dayLabel(d) : grain === 'week' ? dayLabel(d) + '–' + dayLabel(end) : MONTHS[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4);
    out.push({ key: d, from: d, to: end, label });
    d = addDays(end, 1);
  }
  return out;
}
export const autoGrain = (from, to) => {
  const days = (Date.parse(to) - Date.parse(from)) / 864e5 + 1;
  return days <= 31 ? 'day' : days <= 190 ? 'week' : 'month';
};

// Kayıt sınıfı: kesinleşen (onaylı ve gerçekleşen), onay bekleyen, planlanan (onaylı ama gerçekleşmedi), reddedilen, iptal edilen.
export function supportClass(s, r, index) {
  if (r.status === 'rejected') return 'rejected';
  if (r.status === 'cancelled') return 'cancelled';
  if (r.status === 'pending') return 'pending';
  return counted(s, r, index) ? 'final' : 'planned';
}

// Kayıt, başlangıç tarihine göre döneme atanır.
export function dashboard(s, { from, to, deptIds, grain = autoGrain(from, to) }, index = attendanceIndex(s)) {
  const depts = deptIds?.length ? deptIds : s.departments.map(d => d.id);
  const day = r => r.start.slice(0, 10);
  const supports = s.supports.filter(r => (depts.includes(r.fromDept) || depts.includes(r.toDept)) && day(r) >= from && day(r) <= to);
  const cls = new Map(supports.map(r => [r.id, supportClass(s, r, index)]));
  const of = (list, k) => list.filter(r => cls.get(r.id) === k).length;
  const people = list => new Set(list.flatMap(r => r.personIds)).size;
  const series = periods(from, to, grain).map(p => {
    const list = supports.filter(r => day(r) >= p.from && day(r) <= p.to);
    return { ...p, total: list.length, final: of(list, 'final'), pending: of(list, 'pending'), planned: of(list, 'planned'), rejected: of(list, 'rejected'), cancelled: of(list, 'cancelled'), people: people(list.filter(isActive)) };
  });

  // Veren → alan matrisi: kesinleşen destek kaydı sayısı
  const matrix = {};
  for (const r of supports) {
    if (cls.get(r.id) !== 'final') continue;
    matrix[r.fromDept] ??= {};
    matrix[r.fromDept][r.toDept] = (matrix[r.fromDept][r.toDept] ?? 0) + 1;
  }
  const order = id => s.departments.findIndex(d => d.id === id);
  const matrixDepts = [...new Set([...Object.keys(matrix), ...Object.values(matrix).flatMap(Object.keys)])].sort((a, b) => order(a) - order(b));

  // Bölüm özeti: verilen ve alınan kayıtlar, destek veren kişi sayısı
  const byDept = depts.map(id => {
    const given = supports.filter(r => r.fromDept === id), received = supports.filter(r => r.toDept === id);
    return {
      deptId: id, givenFinal: of(given, 'final'), receivedFinal: of(received, 'final'), pending: of(given, 'pending') + of(received, 'pending'),
      rejected: of(given, 'rejected') + of(received, 'rejected'), cancelled: of(given, 'cancelled') + of(received, 'cancelled'),
      people: people(given.filter(r => cls.get(r.id) === 'final'))
    };
  });

  const count = Object.fromEntries(['final', 'pending', 'planned', 'rejected', 'cancelled'].map(k => [k, of(supports, k)]));
  const decided = supports.filter(r => r.status === 'approved' || r.status === 'rejected').length;

  // Uyumsuz destek özeti (kullanıcı açarsa gösterilir)
  const mm = supports.filter(isActive).map(r => ({ r, list: mismatches(s, r, index) })).filter(x => x.list.length);
  const mismatch = {
    count: mm.length, open: mm.filter(x => !x.r.issueResolved).length, people: new Set(mm.flatMap(x => x.list.map(i => i.personId))).size,
    byCode: ['absent', 'outside', 'exceeds'].map(code => ({ code, count: mm.filter(x => x.list.some(i => i.code === code)).length })),
    byDept: depts.map(id => ({ deptId: id, count: mm.filter(x => x.r.toDept === id || x.r.fromDept === id).length })).filter(x => x.count)
  };

  return {
    from, to, grain, depts, series, matrix, matrixDepts, byDept, count, mismatch,
    kpi: {
      total: supports.length, final: count.final, pending: count.pending, planned: count.planned,
      people: people(supports.filter(r => cls.get(r.id) === 'final')),
      rejectRate: decided ? supports.filter(r => r.status === 'rejected').length / decided : null,
      cancelled: count.cancelled
    }
  };
}

// ---------- Ek analizler: ısı haritası, vardiya, giriş gecikmesi, onay süresi, personel ----------

const median = list => { if (!list.length) return null; const a = [...list].sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const avg = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
export const DELAY_BUCKETS = [['0', 'Aynı gün', 0, 0], ['1', 'Ertesi gün', 1, 1], ['2-3', '2–3 gün', 2, 3], ['4-7', '4–7 gün', 4, 7], ['8+', '8 gün ve üzeri', 8, Infinity]];

// filters: { from, to, deptIds, shiftId } — shiftId: 'none' vardiyasız kayıtlar
export function scopeSupports(s, { from, to, deptIds, shiftId }) {
  const depts = deptIds?.length ? deptIds : s.departments.map(d => d.id);
  return s.supports.filter(r => (depts.includes(r.fromDept) || depts.includes(r.toDept))
    && (!from || r.start.slice(0, 10) >= from) && (!to || r.start.slice(0, 10) <= to)
    && (!shiftId || shiftId === 'all' || (shiftId === 'none' ? !r.shiftId : r.shiftId === shiftId)));
}

export function analytics(s, filters, index = attendanceIndex(s)) {
  const depts = filters.deptIds?.length ? filters.deptIds : s.departments.map(d => d.id);
  const list = scopeSupports(s, filters);
  const active = list.filter(isActive);
  const cls = r => supportClass(s, r, index);

  // Gün × bölüm ısı haritası (iptal/ret hariç): alınan ve verilen kayıt sayısı
  const days = [];
  for (let d = filters.from; d <= filters.to; d = addDays(d, 1)) days.push(d);
  const heat = { days, rows: depts.map(id => ({ deptId: id, received: days.map(d => active.filter(r => r.toDept === id && r.start.slice(0, 10) === d).length), given: days.map(d => active.filter(r => r.fromDept === id && r.start.slice(0, 10) === d).length) })) };

  const shifts = [...(s.shifts ?? []).map(x => ({ id: x.id, name: x.name })), { id: '', name: 'Vardiyasız' }]
    .map(x => ({ ...x, total: active.filter(r => (r.shiftId ?? '') === x.id).length, final: active.filter(r => (r.shiftId ?? '') === x.id && cls(r) === 'final').length }))
    .filter(x => x.total > 0 || x.id);

  // Giriş gecikmesi: desteğin başladığı gün ile sisteme ilk girildiği gün arası (planlanan kayıtlar hariç)
  const delayOf = r => Math.max(0, dayDiff(r.start.slice(0, 10), localDay(new Date(r.createdAt))));
  const entered = list.filter(r => r.realized && r.createdAt);
  const delays = entered.map(delayOf);
  const bucket = d => DELAY_BUCKETS.find(([, , lo, hi]) => d >= lo && d <= hi)[0];
  const delay = {
    count: delays.length, average: avg(delays), median: median(delays),
    buckets: DELAY_BUCKETS.map(([id, name]) => ({ id, name, count: delays.filter(d => bucket(d) === id).length })),
    byDept: depts.map(id => { const v = entered.filter(r => r.fromDept === id).map(delayOf); return { deptId: id, count: v.length, average: avg(v), median: median(v), late: v.filter(x => x >= 4).length }; }).filter(x => x.count)
  };

  // Onay süresi: onaya gönderim → karar (saat). Sistem onayları ayrı sayılır.
  const decided = list.filter(r => r.decidedAt && r.submittedAt && ['approved', 'rejected'].includes(r.status) || (r.status === 'cancelled' && r.cancelledFrom === 'approved' && r.decidedAt));
  const hoursOf = r => Math.max(0, (Date.parse(r.decidedAt) - Date.parse(r.submittedAt)) / 3600000);
  const manual = decided.filter(r => r.source !== 'auto');
  const approval = {
    count: decided.length, auto: decided.filter(r => r.source === 'auto').length,
    averageHours: avg(manual.map(hoursOf)), medianHours: median(manual.map(hoursOf)),
    waiting: list.filter(r => r.status === 'pending').length,
    byDept: depts.map(id => { const v = manual.filter(r => r.toDept === id).map(hoursOf); return { deptId: id, count: decided.filter(r => r.toDept === id).length, auto: decided.filter(r => r.toDept === id && r.source === 'auto').length, averageHours: avg(v), medianHours: median(v) }; }).filter(x => x.count)
  };

  // Personel: kesinleşen destek sayısı ve gün
  const people = new Map();
  for (const r of list.filter(r => cls(r) === 'final')) for (const id of r.personIds) {
    const p = people.get(id) ?? { personId: id, count: 0, days: new Set(), toDepts: new Set() };
    p.count++; p.days.add(r.start.slice(0, 10)); p.toDepts.add(r.toDept); people.set(id, p);
  }
  const mmPeople = new Map();
  for (const r of active) for (const i of mismatches(s, r, index)) mmPeople.set(i.personId, (mmPeople.get(i.personId) ?? 0) + 1);
  const persons = [...people.values()].map(p => ({ personId: p.personId, count: p.count, days: p.days.size, toDepts: [...p.toDepts], mismatches: mmPeople.get(p.personId) ?? 0 }))
    .sort((a, b) => b.count - a.count || b.days - a.days);

  return { heat, shifts, delay, approval, persons };
}
