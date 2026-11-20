// Destek Merkezi iş kuralları çekirdeği.
// Tarayıcı, sunucu ve Access istemcisi bütün değişiklikleri buradaki applyAction üzerinden yapar.
// Sunucu her istekte durumu (s) veritabanından okur, applyAction ile değiştirir ve geri yazar.

import { MAX_LEVELS, levels } from './org.mjs';

export const uid = () => crypto.randomUUID();
export const TIME_ZONE = 'Europe/Istanbul';
export const today = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
// 'YYYY-AA-GGTSS:DD' biçimindeki yerel saati Türkiye saatiyle Date nesnesine çevirir.
export const instant = s => new Date(s.length === 16 ? s + ':00+03:00' : s);
export const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 864e5).toISOString().slice(0, 10);

export const SETTINGS_DEFAULTS = {
  days: 7, reminderHours: 24,
  entryBackDays: 7, weeklyClose: false, weeklyCloseDay: 1, weeklyCloseHour: 12,
  autoApprove: true, attendanceCheck: true, blockIssues: false, holdIssues: true, excludeIssues: false
};
const BOOLEAN_SETTINGS = ['autoApprove', 'attendanceCheck', 'blockIssues', 'holdIssues', 'excludeIssues', 'weeklyClose'];
// Vardiyalı destek sabittir: saatler ve mola (yemek + çay) vardiya tanımından gelir.
export const shiftBreak = sh => Number(sh?.mealMinutes ?? 0) + Number(sh?.teaMinutes ?? 0);
export function shiftTimes(sh, date) {
  const endDate = sh.end <= sh.start ? addDays(date, 1) : date;
  return { start: date + 'T' + sh.start, end: endDate + 'T' + sh.end, breakMinutes: shiftBreak(sh) };
}
export const durationText = hours => { const m = Math.round(hours * 60); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
const setting = (s, key) => s.settings?.[key] ?? SETTINGS_DEFAULTS[key];

// ---------- Hesaplar ----------
export const netHours = r => Math.max(0, (instant(r.end) - instant(r.start)) / 3600000 - Number(r.breakMinutes || 0) / 60);
export const due = (s, r) => new Date(new Date(r.submittedAt).getTime() + setting(s, 'days') * 86400000);

// ---------- Yetki ----------
export const access = (u, dept) => u.role === 'admin' || u.role === 'auditor' || u.deptIds.includes(dept);
export const writable = (u, dept) => u.role === 'admin' || (u.role === 'manager' && u.deptIds.includes(dept));
// Kaydı oluşturan da, son düzenleyip onaya gönderen de karar veremez.
export const isAuthor = (u, r) => r.createdBy === u.id || (r.submittedBy ?? r.createdBy) === u.id;
// Reddedilen ve iptal edilen (geri çekilen) kayıtlar hiçbir hesaba ve çakışma kontrolüne girmez.
export const isActive = r => r.status !== 'rejected' && r.status !== 'cancelled';
export const canDecide = (u, r) => r.status === 'pending' && writable(u, r.toDept) && !isAuthor(u, r);

// ---------- Personel ve bölüm geçmişi ----------
// deptHistory: [{deptId, until}] = kişi 'until' tarihinden önce bu bölümdeydi (until hariç).
export function deptOn(person, date) {
  if (person.startDate && date < person.startDate) return null;
  for (const h of person.deptHistory ?? []) if (date < h.until) return h.deptId;
  return person.deptId;
}

// ---------- Puantaj kontrolü ----------
// Aynı rapor içinde binlerce kez arama yapmamak için sicil+tarih dizini.
export function attendanceIndex(s) {
  const index = new Map();
  for (const a of s.attendance) index.set(a.personId + ':' + a.date, a);
  return index;
}
export function issues(s, r, index = null) {
  if (!setting(s, 'attendanceCheck')) return [];
  const out = [];
  const date = r.start.slice(0, 10);
  for (const id of r.personIds) {
    const p = s.people.find(x => x.id === id);
    const name = p?.name || id;
    const a = index ? index.get(id + ':' + date) : s.attendance.find(x => x.personId === id && x.date === date);
    if (!a) { out.push({ personId: id, name, code: 'missing', message: 'Puantaj verisi yok' }); continue; }
    if (a.status === 'absent') { out.push({ personId: id, name, code: 'absent', message: 'İşe gelmediği gün destek kaydı' + (a.label ? ' (' + a.label + ')' : '') }); continue; }
    if (a.shiftId && r.shiftId && a.shiftId !== r.shiftId) {
      const shiftName = id => s.shifts?.find(x => x.id === id)?.name ?? id;
      out.push({ personId: id, name, code: 'shift', message: 'Puantajda başka vardiyada (' + shiftName(a.shiftId) + '), destek ' + shiftName(r.shiftId) + ' vardiyasında' });
    }
    if (a.start && a.end && (instant(r.start) < instant(a.start) || instant(r.end) > instant(a.end))) {
      out.push({ personId: id, name, code: 'outside', message: 'Destek saatleri puantaj aralığı dışında' });
    }
    // Puantajda çalışma süresi varsa: kişinin o günkü reddedilmemiş desteklerinin toplamı bu süreyi aşamaz.
    if (a.status === 'present' && Number.isFinite(a.hours)) {
      const total = netHours(r) + s.supports
        .filter(x => x.id !== r.id && isActive(x) && x.start.slice(0, 10) === date && x.personIds.includes(id))
        .reduce((sum, x) => sum + netHours(x), 0);
      if (total > a.hours + 1e-9) out.push({ personId: id, name, code: 'exceeds', message: 'Günlük destek süresi (' + hoursText(total) + ') puantajdaki çalışma süresini (' + hoursText(a.hours) + ') aşıyor' });
    }
  }
  return out;
}
const hoursText = h => { const m = Math.round(h * 60); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ' sa'; };
// Uyumsuz destek: işe gelmeme, puantaj aralığı dışı veya çalışma süresini aşma. Eksik puantaj yalnızca veri uyarısıdır.
export const mismatches = (s, r, index) => issues(s, r, index).filter(x => x.code !== 'missing');
export const blockedIssues = (s, r, index) => mismatches(s, r, index).length > 0 && !r.issueResolved;
// Geri çekme: kaydı giren bölüm. Uyumsuzluk nedeniyle iptal: iki bölümden biri. Yönetici her ikisini yapabilir.
export const canWithdraw = (u, r) => isActive(r) && writable(u, r.fromDept);
export const canCancelMismatch = (s, u, r, index) => isActive(r) && (writable(u, r.fromDept) || writable(u, r.toDept)) && mismatches(s, r, index).length > 0;
export const counted = (s, r, index) => r.status === 'approved' && r.realized && !(setting(s, 'excludeIssues') && blockedIssues(s, r, index));

// ---------- İşlem geçmişi ----------
export function record(s, u, action, detail) {
  s.events.unshift({ id: uid(), time: new Date().toISOString(), user: u.name, userId: u.id ?? null, action, detail });
}

// ---------- Geçmiş tarih kontrolü ----------
// Destekler genelde ertesi gün veya ertesi hafta girilir. Bu yüzden son 'entryBackDays' gün serbesttir.
// Haftalık kapanış açıksa, kapanış anı geçtiğinde önceki haftalar kilitlenir. Kilitli tarihler için yöneticinin açtığı pencere gerekir.
export function entryFloor(s, now = new Date()) {
  const t = today(now);
  let floor = addDays(t, -Number(setting(s, 'entryBackDays')));
  if (setting(s, 'weeklyClose')) {
    const monday = addDays(t, -((new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7));
    const closeDay = addDays(monday, Number(setting(s, 'weeklyCloseDay')) - 1);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));
    const passed = t > closeDay || (t === closeDay && hour >= Number(setting(s, 'weeklyCloseHour')));
    const lockedBefore = passed ? monday : addDays(monday, -7);
    if (lockedBefore > floor) floor = lockedBefore;
  }
  return floor;
}
export function periodOpen(s, u, r, now = new Date()) {
  if (r.start.slice(0, 10) >= entryFloor(s, now)) return true;
  const dept = s.departments.find(d => d.id === r.fromDept);
  const t = now.getTime();
  return s.windows.some(w => !w.closed
    && w.dateFrom <= r.start.slice(0, 10) && w.dateTo >= r.end.slice(0, 10)
    && instant(w.validFrom).getTime() <= t && instant(w.validUntil).getTime() >= t
    && (w.scope === 'all'
      || (w.scope === 'location' && w.locationIds.includes(dept?.locationId))
      || (w.scope === 'department' && w.deptIds.includes(r.fromDept))
      || (w.scope === 'combined' && w.locationIds.includes(dept?.locationId) && w.deptIds.includes(r.fromDept)))
    && (!w.userIds?.length || w.userIds.includes(u.id)));
}

const ensure = (condition, message) => { if (!condition) throw new Error(message); };

// ---------- Arka plan kuralları: otomatik onay ve son gün hatırlatması ----------
export function runRules(s, u, now = new Date()) {
  let approved = 0, queued = 0;
  const index = attendanceIndex(s);
  for (const r of s.supports) {
    if (r.status !== 'pending') continue;
    const deadline = due(s, r), remaining = deadline - now;
    if (setting(s, 'autoApprove') && remaining <= 0 && (!setting(s, 'holdIssues') || !blockedIssues(s, r, index))) {
      Object.assign(r, { status: 'approved', source: 'auto', decidedAt: now.toISOString(), decidedBy: 'Sistem' });
      record(s, u, 'Otomatik onay', r.code);
      approved++;
      continue;
    }
    if (setting(s, 'autoApprove') && remaining > 0 && remaining <= setting(s, 'reminderHours') * 3600000) {
      const key = r.id + ':' + r.submittedAt;
      if (s.notifications.some(n => n.key === key)) continue;
      const recipients = s.users.filter(a => a.active && a.role === 'manager' && a.deptIds.includes(r.toDept) && !isAuthor(a, r)).map(a => a.email).filter(Boolean);
      s.notifications.unshift({
        id: uid(), key, requestId: r.id, time: now.toISOString(), deadline: deadline.toISOString(), recipients,
        subject: 'Destek onayı için son gün · ' + r.code,
        body: r.code + ' numaralı destek kaydı için son onay/ret zamanı: ' + deadline.toLocaleString('tr-TR', { timeZone: TIME_ZONE }) + '. Destek Merkezi / Onay kutusu ekranından inceleyebilirsiniz.',
        status: 'draft'
      });
      queued++;
    }
  }
  return { approved, queued };
}

// ---------- Destek kaydı değişiklik özeti ----------
const SUPPORT_FIELDS = ['fromDept', 'toDept', 'personIds', 'start', 'end', 'breakMinutes', 'realized', 'note', 'shiftId'];
const FIELD_LABELS = { fromDept: 'veren bölüm', toDept: 'alan bölüm', personIds: 'personel', start: 'başlangıç', end: 'bitiş', breakMinutes: 'mola', realized: 'kayıt türü', note: 'açıklama', shiftId: 'vardiya' };
function changedFields(old, r) {
  return SUPPORT_FIELDS.filter(k => JSON.stringify(old[k]) !== JSON.stringify(r[k])).map(k => FIELD_LABELS[k]);
}

// ---------- Excel aktarımı yardımcıları ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const validDate = d => DATE.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().startsWith(d);
const MAX_IMPORT_ROWS = 10000;
const CODE = /^[A-Za-z0-9_-]{2,16}$/;

export function applyAction(s, u, action, p, now = new Date()) {
  ensure(u.active, 'Kullanıcı hesabı pasif.');
  s.settings = { ...SETTINGS_DEFAULTS, ...s.settings };

  if (action === 'support') {
    if (p.shiftId) {
      // Vardiya seçildiyse saat ve mola sunucuda vardiya tanımından hesaplanır; elle değiştirilemez.
      const sh = s.shifts?.find(x => x.id === p.shiftId);
      ensure(sh && sh.active !== false, 'Vardiya seçimi geçersiz.');
      const date = String(p.date || p.start || '').slice(0, 10);
      ensure(DATE.test(date), 'Tarih seçin.');
      p = { ...p, ...shiftTimes(sh, date) };
    }
    const old = p.id ? s.supports.find(r => r.id === p.id) : null;
    ensure(!p.id || old, 'Kayıt bulunamadı.');
    ensure(writable(u, p.fromDept), 'Destek veren bölüm için kayıt yetkiniz yok.');
    ensure(!old || writable(u, old.fromDept), 'Mevcut kayıt için yetkiniz yok.');
    ensure(s.departments.some(d => d.id === p.fromDept) && s.departments.some(d => d.id === p.toDept), 'Bölüm seçimi geçersiz.');
    ensure(p.fromDept !== p.toDept, 'Destek veren ve alan bölüm farklı olmalı.');
    ensure(DATETIME.test(p.start) && DATETIME.test(p.end), 'Başlangıç ve bitiş YYYY-AA-GG SS:DD biçiminde olmalı.');
    const start = instant(p.start), end = instant(p.end);
    ensure(Number.isFinite(+start) && Number.isFinite(+end) && end > start, 'Başlangıç ve bitiş saatlerini kontrol edin.');
    ensure((end - start) <= 36 * 3600000, 'Tek destek kaydı en fazla 36 saat olabilir.');
    ensure(Number.isFinite(+p.breakMinutes) && +p.breakMinutes >= 0 && +p.breakMinutes < (end - start) / 60000, 'Mola süresi çalışma aralığından kısa olmalı.');
    ensure(!p.realized || end <= now, 'Bitişi henüz gelmemiş destek "gerçekleşen" olarak girilemez. Planlanan olarak kaydedin.');
    ensure(Array.isArray(p.personIds) && p.personIds.length > 0, 'En az bir personel seçin.');
    ensure(new Set(p.personIds).size === p.personIds.length, 'Aynı personel iki kez seçilemez.');
    for (const id of p.personIds) {
      ensure(s.people.some(x => x.id === id && x.active && x.deptId === p.fromDept), 'Personelin bağlı bölümü veya aktifliği uygun değil.');
      ensure(!s.supports.some(r => r.id !== p.id && isActive(r) && r.personIds.includes(id) && start < instant(r.end) && end > instant(r.start)), 'Personelin aynı saatlerde başka bir destek kaydı var.');
      // Aynı kişiye aynı gün ikinci destek kaydı girilemez (tekrar girişi önler).
      const same = s.supports.find(r => r.id !== p.id && isActive(r) && r.personIds.includes(id) && r.start.slice(0, 10) === p.start.slice(0, 10));
      ensure(!same, (s.people.find(x => x.id === id)?.name ?? 'Personel') + ' için ' + p.start.slice(0, 10) + ' tarihinde zaten destek kaydı var (' + same?.code + ').');
    }
    if (p.shiftId) {
      const shift = s.shifts?.find(x => x.id === p.shiftId);
      const loc = s.departments.find(d => d.id === p.fromDept)?.locationId;
      ensure(shift && shift.active !== false && (!shift.locationId || shift.locationId === loc), 'Vardiya seçimi geçersiz.');
    }
    ensure(periodOpen(s, u, p, now), 'Bu tarih için giriş kapalı (geriye dönük süre veya haftalık kapanış). Adminin dönem açması gerekiyor.');
    if (old) ensure(periodOpen(s, u, old, now), 'Mevcut kaydın dönemi kapalı.');
    const r = {
      id: old?.id || uid(),
      code: old?.code || nextCode(s),
      fromDept: p.fromDept, toDept: p.toDept, personIds: p.personIds, start: p.start, end: p.end,
      breakMinutes: +p.breakMinutes, realized: !!p.realized, note: String(p.note || '').slice(0, 1000),
      shiftId: p.shiftId || null,
      status: 'pending', source: null, reason: '',
      submittedAt: now.toISOString(), submittedBy: u.id,
      createdAt: old?.createdAt || now.toISOString(), createdBy: old?.createdBy || u.id,
      issueResolved: false, issueHistory: old?.issueHistory ?? [],
      // Önceki her sürüm, verdiği kararla birlikte saklanır.
      history: old ? [...(old.history ?? []), {
        ...Object.fromEntries([...SUPPORT_FIELDS, 'status', 'source', 'reason', 'decidedAt', 'decidedBy', 'submittedAt', 'submittedBy', 'cancelKind', 'cancelReason', 'cancelledAt', 'cancelledBy'].map(k => [k, old[k] ?? null])),
        replacedAt: now.toISOString(), replacedBy: u.id
      }] : []
    };
    ensure(!setting(s, 'blockIssues') || !blockedIssues(s, r), 'Puantaj uyuşmazlığı nedeniyle kayıt engellendi.');
    if (old) s.supports = s.supports.map(x => x.id === old.id ? r : x); else s.supports.unshift(r);
    const changes = old ? changedFields(old, r) : [];
    record(s, u, old ? 'Kayıt güncellendi; yeniden onaya gönderildi' : 'Destek onaya gönderildi',
      r.code + (old ? ' · önceki durum: ' + old.status + (changes.length ? ' · değişen: ' + changes.join(', ') : '') : ''));

  } else if (action === 'orgLevels') {
    // Hiyerarşi düzeyleri: en alttan üste adlar. Derinliği ve isimlendirmeyi kullanıcı belirler.
    ensure(u.role === 'admin', 'Hiyerarşi yetkisi yalnızca adminde.');
    const names = (p.levels ?? []).map(x => String(x ?? '').trim());
    ensure(names.length >= 1 && names.length <= MAX_LEVELS, 'Hiyerarşi 1–' + MAX_LEVELS + ' düzey olmalı.');
    ensure(names.every(x => x.length >= 2 && x.length <= 40), 'Düzey adları 2–40 karakter olmalı.');
    ensure(new Set(names.map(x => x.toLocaleLowerCase('tr'))).size === names.length, 'Düzey adları farklı olmalı.');
    const deepest = Math.max(1, ...(s.orgUnits ?? []).map(x => x.level));
    ensure(deepest <= names.length, 'Kaldırılan düzeyde tanımlı birimler var. Önce o birimleri silin veya düzeyi koruyun.');
    s.settings = { ...s.settings, orgLevels: names };
    record(s, u, 'Hiyerarşi düzeyleri güncellendi', names.join(' → '));

  } else if (action === 'deleteOrgUnit') {
    ensure(u.role === 'admin', 'Yetkiniz yok.');
    const unit = (s.orgUnits ?? []).find(x => x.id === p.id);
    ensure(unit, 'Birim bulunamadı.');
    ensure(!s.orgUnits.some(x => x.parentId === unit.id) && !s.departments.some(d => d.parentId === unit.id), 'Bu birime bağlı alt birimler var. Önce onları başka birime bağlayın.');
    s.orgUnits = s.orgUnits.filter(x => x.id !== unit.id);
    record(s, u, 'Hiyerarşi birimi silindi', unit.name);

  } else if (action === 'decision') {
    const r = s.supports.find(r => r.id === p.id);
    ensure(r, 'Kayıt bulunamadı.');
    ensure(writable(u, r.toDept), 'Karşı bölüm onay yetkiniz yok.');
    ensure(!isAuthor(u, r), 'Kaydı oluşturan veya son düzenleyen kişi karar veremez. Farklı yetkili seçin.');
    ensure(r.status === 'pending', 'Yalnızca bekleyen kayıtlar sonuçlandırılabilir.');
    ensure(['approved', 'rejected'].includes(p.status), 'Geçersiz karar.');
    ensure(p.status !== 'rejected' || p.reason?.trim(), 'Ret gerekçesi zorunlu.');
    Object.assign(r, { status: p.status, reason: String(p.reason || '').slice(0, 1000), source: 'manual', decidedAt: now.toISOString(), decidedBy: u.name, decidedById: u.id });
    record(s, u, p.status === 'approved' ? 'Destek onaylandı' : 'Destek reddedildi', r.code + (r.reason ? ' · ' + r.reason : ''));

  } else if (action === 'supportBatch') {
    // Toplu giriş: kayıtlar önce bir kopya üzerinde denenir; tek hata varsa hiçbiri kaydedilmez.
    ensure(Array.isArray(p.items) && p.items.length >= 1 && p.items.length <= 300, 'Toplu girişte 1–300 kayıt olmalı.');
    const trial = structuredClone(s), errors = [];
    p.items.forEach((item, i) => {
      ensure(!item.id, 'Toplu giriş yalnızca yeni kayıt açar.');
      try { applyAction(trial, u, 'support', item, now); } catch (e) { errors.push('Satır ' + (item._row ?? i + 1) + ': ' + e.message); }
    });
    if (errors.length) throw new Error(errors.length + ' kayıtta hata var, hiçbir kayıt açılmadı.\n' + errors.slice(0, 25).join('\n'));
    Object.assign(s, trial);
    record(s, u, 'Toplu destek girişi', p.items.length + ' kayıt onaya gönderildi');

  } else if (action === 'cancel') {
    // Kayıt silinmez: durum 'cancelled' olur, gerekçe ve önceki durum saklanır. Düzenlenip yeniden onaya gönderilebilir.
    const r = s.supports.find(r => r.id === p.id);
    ensure(r, 'Kayıt bulunamadı.');
    ensure(['withdraw', 'mismatch'].includes(p.kind), 'İptal türü geçersiz.');
    ensure(isActive(r), 'Bu kayıt zaten reddedilmiş veya iptal edilmiş.');
    if (p.kind === 'withdraw') ensure(canWithdraw(u, r), 'Kaydı yalnızca destek veren bölümün yetkilisi geri çekebilir.');
    else ensure(canCancelMismatch(s, u, r), 'Bu kayıtta açık bir puantaj uyuşmazlığı yok veya iptal yetkiniz yok.');
    ensure(u.role === 'admin' || periodOpen(s, u, r, now), 'Kaydın dönemi kapalı. Geri çekmek için adminin dönem açması gerekiyor.');
    ensure(r.status === 'pending' || p.reason?.trim(), 'Onaylanmış kaydı geri çekmek için gerekçe zorunlu.');
    ensure(p.kind === 'withdraw' || p.reason?.trim(), 'İptal gerekçesi zorunlu.');
    Object.assign(r, {
      cancelledFrom: r.status, status: 'cancelled', cancelKind: p.kind, cancelReason: String(p.reason || '').slice(0, 1000),
      cancelledAt: now.toISOString(), cancelledBy: u.name, cancelledById: u.id
    });
    record(s, u, p.kind === 'withdraw' ? 'Destek geri çekildi' : 'Uyumsuz destek iptal edildi',
      r.code + ' · önceki durum: ' + r.cancelledFrom + (r.cancelReason ? ' · ' + r.cancelReason : ''));

  } else if (action === 'resolve') {
    const r = s.supports.find(r => r.id === p.id);
    ensure(r && writable(u, r.toDept), 'İnceleme yetkiniz yok.');
    ensure(p.reason?.trim(), 'İnceleme açıklaması zorunlu.');
    Object.assign(r, { issueResolved: true, issueNote: String(p.reason).slice(0, 1000), issueResolvedAt: now.toISOString(), issueResolvedBy: u.name });
    record(s, u, 'Puantaj uyuşmazlığı incelendi', r.code + ' · ' + r.issueNote);

  } else if (action === 'window') {
    ensure(u.role === 'admin', 'Dönem açma yetkisi yalnızca adminde.');
    ensure(p.dateFrom && p.dateTo && p.dateFrom <= p.dateTo, 'Tarih aralığı geçersiz.');
    ensure(instant(p.validUntil) > instant(p.validFrom), 'İzin bitişi başlangıçtan sonra olmalı.');
    ensure(p.reason?.trim(), 'Açılış gerekçesi zorunlu.');
    ensure(['all', 'location', 'department', 'combined'].includes(p.scope), 'Kapsam geçersiz.');
    ensure(!['location', 'combined'].includes(p.scope) || p.locationIds?.length, 'Lokasyon seçin.');
    ensure(!['department', 'combined'].includes(p.scope) || p.deptIds?.length, 'Bölüm seçin.');
    s.windows.unshift({ ...p, id: uid(), closed: false, createdBy: u.name });
    record(s, u, 'Geçmiş dönem açıldı', p.dateFrom + ' / ' + p.dateTo + ' · ' + p.reason);

  } else if (action === 'closeWindow') {
    ensure(u.role === 'admin', 'Yetkiniz yok.');
    const w = s.windows.find(x => x.id === p.id);
    ensure(w, 'Dönem bulunamadı.');
    w.closed = true;
    record(s, u, 'Dönem kapatıldı', w.dateFrom + ' / ' + w.dateTo);

  } else if (action === 'settings') {
    ensure(u.role === 'admin', 'Parametre yetkiniz yok.');
    const num = (key, min, max, label) => {
      const v = Number(p[key] ?? setting(s, key));
      ensure(Number.isInteger(v) && v >= min && v <= max, label + ' ' + min + '–' + max + ' arasında olmalı.');
      return v;
    };
    const days = num('days', 1, 90, 'Onay süresi (gün)');
    const reminderHours = num('reminderHours', 1, days * 24, 'Hatırlatma zamanı (saat)');
    const entryBackDays = num('entryBackDays', 0, 60, 'Geriye dönük giriş süresi (gün)');
    const weeklyCloseDay = num('weeklyCloseDay', 1, 7, 'Haftalık kapanış günü');
    const weeklyCloseHour = num('weeklyCloseHour', 0, 23, 'Haftalık kapanış saati');
    const flags = {};
    for (const key of BOOLEAN_SETTINGS) {
      if (p[key] === undefined) continue;
      ensure(typeof p[key] === 'boolean', 'Parametre değeri geçersiz: ' + key);
      flags[key] = p[key];
    }
    s.settings = { ...s.settings, ...flags, days, reminderHours, entryBackDays, weeklyCloseDay, weeklyCloseHour };
    delete s.settings.entryGraceHours;
    record(s, u, 'Parametreler güncellendi', days + ' gün otomatik onay · ' + entryBackDays + ' gün geriye dönük giriş' + (s.settings.weeklyClose ? ' · haftalık kapanış açık' : ''));

  } else if (action === 'definition') {
    ensure(u.role === 'admin', 'Tanım yetkiniz yok.');
    const { kind, value } = p;
    ensure(['locations', 'departments', 'people', 'users', 'shifts', 'orgUnits'].includes(kind), 'Tanım geçersiz.');
    s.shifts ??= [];
    s.orgUnits ??= [];
    ensure(value?.name?.trim(), 'Ad zorunlu.');
    const old = value.id ? s[kind].find(x => x.id === value.id) : null;
    ensure(!value.id || old || kind === 'users', 'Tanım bulunamadı.');
    let id = value.id;
    if (['locations', 'departments', 'shifts', 'orgUnits'].includes(kind) && !old) {
      // Bölüm ve lokasyonun kodu, Excel dosyalarında kullanılacak kısa ve kalıcı kimliğidir.
      const code = String(value.code ?? '').trim().toLocaleUpperCase('tr');
      // Vardiya kodu tek harf olabilir (A, B, C); bölüm ve lokasyon kodu en az 2 karakter.
      ensure((kind === 'shifts' ? /^[A-Za-z0-9_-]{1,16}$/ : CODE).test(code), kind === 'shifts' ? 'Vardiya kodu 1–16 karakter olmalı (ör. A).' : 'Kod 2–16 karakter olmalı; harf, rakam, - ve _ kullanılabilir.');
      ensure(!s[kind].some(x => x.id.toLocaleUpperCase('tr') === code), 'Bu kod zaten kullanılıyor.');
      // Hiyerarşide departman ve üst birim kodları birbirinden de farklı olmalı.
      if (kind === 'departments' || kind === 'orgUnits') ensure(![...s.departments, ...s.orgUnits].some(x => x.id.toLocaleUpperCase('tr') === code), 'Bu kod hiyerarşide başka bir birimde kullanılıyor.');
      id = code;
    }
    if (kind === 'departments') ensure(s.locations.some(x => x.id === value.locationId), 'Lokasyon seçin.');
    // Her tanım türü yalnızca kendi alanlarını saklar (formdan gelen ilgisiz alanlar atılır).
    const v = { id: id || uid(), name: value.name.trim().slice(0, 120), active: value.active !== false };
    if (kind === 'departments') {
      v.locationId = value.locationId;
      if (value.parentId) {
        ensure(levels(s).length > 1 && s.orgUnits.some(u => u.id === value.parentId && u.level === 2), 'Üst birim geçersiz.');
        v.parentId = value.parentId;
      }
    }
    if (kind === 'orgUnits') {
      const depth = levels(s).length, level = Number(old?.level ?? value.level);
      ensure(Number.isInteger(level) && level >= 2 && level <= depth, 'Düzey geçersiz.');
      v.level = level;
      if (value.parentId) {
        ensure(s.orgUnits.some(u => u.id === value.parentId && u.level === level + 1), 'Üst birim bir üst düzeyden seçilmeli.');
        v.parentId = value.parentId;
      }
    }
    if (kind === 'shifts') {
      ensure(/^\d{2}:\d{2}$/.test(value.start ?? '') && /^\d{2}:\d{2}$/.test(value.end ?? '') && value.start !== value.end, 'Vardiya başlangıç ve bitiş saatini SS:DD biçiminde girin.');
      ensure(!value.locationId || s.locations.some(x => x.id === value.locationId), 'Lokasyon geçersiz.');
      const meal = Number(value.mealMinutes ?? 0), tea = Number(value.teaMinutes ?? 0);
      ensure(Number.isInteger(meal) && meal >= 0 && meal <= 180 && Number.isInteger(tea) && tea >= 0 && tea <= 120, 'Yemek molası 0–180, çay molası 0–120 dakika olmalı.');
      const length = ((+value.end.slice(0, 2) * 60 + +value.end.slice(3)) - (+value.start.slice(0, 2) * 60 + +value.start.slice(3)) + 1440) % 1440;
      ensure(meal + tea < length, 'Molalar vardiya süresinden kısa olmalı.');
      Object.assign(v, { start: value.start, end: value.end, mealMinutes: meal, teaMinutes: tea, locationId: value.locationId || null });
    }
    if (kind === 'people') {
      ensure(s.departments.some(x => x.id === value.deptId), 'Bölüm seçin.');
      const code = String(value.code ?? '').trim();
      ensure(code && !s.people.some(x => x.code === code && x.id !== value.id), 'Sicil boş veya başka personele ait.');
      v.code = code;
      v.deptId = value.deptId;
      ensure(!value.startDate || validDate(value.startDate), 'İşe giriş tarihi geçersiz.');
      if (value.startDate) v.startDate = value.startDate;
      v.deptHistory = old?.deptHistory ?? [];
      if (old && old.deptId !== value.deptId) {
        const from = value.deptFrom || today(now);
        ensure(validDate(from), 'Bölüm değişikliği tarihi geçersiz.');
        ensure(!v.deptHistory.length || from >= v.deptHistory.at(-1).until, 'Bölüm değişikliği tarihi önceki değişiklikten önce olamaz.');
        v.deptHistory = [...v.deptHistory, { deptId: old.deptId, until: from }];
      }
    }
    if (kind === 'users') {
      ensure(['admin', 'manager', 'auditor'].includes(value.role), 'Rol geçersiz.');
      ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email), 'Geçerli e-posta girin.');
      ensure(!s.users.some(x => x.id !== value.id && x.email.toLowerCase() === value.email.toLowerCase()), 'E-posta başka kullanıcıya ait.');
      ensure((value.deptIds ?? []).every(id => s.departments.some(d => d.id === id)), 'Bölüm yetkisi geçersiz.');
      Object.assign(v, { email: value.email.trim(), role: value.role, deptIds: value.deptIds ?? [] });
      ensure(!(value.id === u.id && (value.active === false || value.role !== 'admin')), 'Kendi yönetici yetkinizi kaldıramazsınız.');
    }
    const idx = s[kind].findIndex(x => x.id === v.id);
    if (idx < 0) s[kind].push(v); else s[kind][idx] = v;
    record(s, u, 'Tanım kaydedildi', v.name + (kind === 'people' && old && old.deptId !== v.deptId ? ' · bölüm değişti: ' + old.deptId + ' → ' + v.deptId : ''));

  } else if (action === 'import') {
    ensure(u.role === 'admin', 'İçe aktarma yetkisi yalnızca adminde.');
    ensure(p.kind === 'attendance' && Array.isArray(p.rows) && p.rows.length && p.rows.length <= MAX_IMPORT_ROWS, 'Dosya 1–' + MAX_IMPORT_ROWS + ' satır içermeli.');
    const rows = [], keys = new Set(), errors = [];
    const fail = (raw, i, message) => errors.push('Satır ' + (raw?._row ?? i + 2) + ': ' + message);
    p.rows.forEach((raw, i) => {
      if (!raw || typeof raw !== 'object') return fail(raw, i, 'Satır okunamadı.');
      if (!validDate(raw.date)) return fail(raw, i, 'Tarih geçersiz (' + (raw.date ?? 'boş') + ').');
      if (p.kind === 'attendance') {
        const person = s.people.find(x => x.code === String(raw.code ?? '').trim());
        if (!person) return fail(raw, i, 'Bilinmeyen sicil: ' + (raw.code ?? 'boş'));
        if (!['present', 'absent'].includes(raw.status)) return fail(raw, i, 'Durum present veya absent olmalı.');
        const hasTimes = raw.start || raw.end;
        if (hasTimes && !(DATETIME.test(raw.start ?? '') && DATETIME.test(raw.end ?? '') && instant(raw.end) > instant(raw.start))) return fail(raw, i, 'Giriş/çıkış birlikte ve doğru sırada olmalı.');
        if (hasTimes && instant(raw.end) - instant(raw.start) > 24 * 3600000) return fail(raw, i, 'Giriş–çıkış 24 saati aşamaz.');
        const id = person.id + ':' + raw.date;
        if (keys.has(id)) return fail(raw, i, 'Aynı sicil ve tarih dosyada tekrar ediyor.');
        keys.add(id);
        let shiftId = null;
        if (raw.shift) {
          const key = String(raw.shift).trim().toLocaleLowerCase('tr');
          const shift = (s.shifts ?? []).find(x => x.id.toLocaleLowerCase('tr') === key || x.name.toLocaleLowerCase('tr') === key);
          if (!shift) return fail(raw, i, 'Bilinmeyen vardiya: ' + raw.shift);
          shiftId = shift.id;
        }
        const hasHours = raw.hours !== undefined && raw.hours !== null && raw.hours !== '';
        if (hasHours && !(Number.isFinite(+raw.hours) && +raw.hours >= 0 && +raw.hours <= 24)) return fail(raw, i, 'Çalışma süresi 0–24 saat olmalı.');
        if (hasHours && hasTimes && +raw.hours > (instant(raw.end) - instant(raw.start)) / 3600000 + 1e-9) return fail(raw, i, 'Çalışma süresi giriş–çıkış aralığından uzun olamaz.');
        rows.push({ id, personId: person.id, date: raw.date, status: raw.status, label: raw.label ? String(raw.label).slice(0, 40) : null, start: hasTimes ? raw.start : null, end: hasTimes ? raw.end : null, hours: hasHours && raw.status === 'present' ? +raw.hours : null, shiftId, importedAt: now.toISOString(), importId: null });
      }
    });
    // Hatalı satır varsa hiçbir kayıt değişmez; bütün hatalar birlikte bildirilir.
    if (errors.length) throw new Error(errors.length + ' satırda hata var, hiçbir kayıt değiştirilmedi.\n' + errors.slice(0, 25).join('\n') + (errors.length > 25 ? '\n… ve ' + (errors.length - 25) + ' hata daha.' : ''));
    const importId = uid();
    for (const row of rows) {
      if (p.kind === 'attendance') row.importId = importId;
      const idx = s[p.kind].findIndex(x => x.id === row.id);
      if (idx < 0) s[p.kind].push(row); else s[p.kind][idx] = row;
    }
    let rechecked = 0;
    if (p.kind === 'attendance') {
      // Sadece puantajı değişen kişi-günlere ait destek kayıtları yeniden incelemeye düşer; eski not saklanır.
      for (const r of s.supports) {
        if (!r.personIds.some(id => keys.has(id + ':' + r.start.slice(0, 10)))) continue;
        if (r.issueResolved) {
          r.issueHistory = [...(r.issueHistory ?? []), { note: r.issueNote, resolvedAt: r.issueResolvedAt ?? null, resolvedBy: r.issueResolvedBy ?? null, clearedAt: now.toISOString(), clearedBy: 'Puantaj güncellemesi · ' + importId.slice(0, 8) }];
          rechecked++;
        }
        r.issueResolved = false;
        r.issueNote = null;
      }
      s.imports = [{ id: importId, time: now.toISOString(), user: u.name, rows: rows.length, fileName: String(p.fileName ?? '').slice(0, 120) }, ...(s.imports ?? [])].slice(0, 100);
    }
    record(s, u, 'Excel/CSV içe aktarıldı', p.kind + ' · ' + rows.length + ' satır' + (rechecked ? ' · ' + rechecked + ' incelenmiş kayıt yeniden kontrole alındı' : ''));

  } else if (action === 'rules') {
    ensure(u.role === 'admin', 'Kural çalıştırma yetkiniz yok.');
    const result = runRules(s, u, now);
    record(s, u, 'Kurallar çalıştırıldı', result.approved + ' otomatik onay, ' + result.queued + ' bildirim taslağı');

  } else throw new Error('İşlem tanınmadı.');
  return s;
}

// Kod, en büyük mevcut numaranın bir fazlasıdır; ileride silme eklenirse de çakışmaz.
function nextCode(s) {
  const max = s.supports.reduce((m, r) => Math.max(m, Number(/^DST-(\d+)$/.exec(r.code)?.[1] ?? 0)), 0);
  return 'DST-' + String(max + 1).padStart(4, '0');
}

export function seed(ownerId, email, now = new Date()) {
  const date = today(now);
  const old = new Date(now - 8 * 86400000).toISOString(), near = new Date(now - 6.5 * 86400000).toISOString();
  const s = {
    locations: [{ id: 'IST', name: 'İstanbul Dağıtım Merkezi' }, { id: 'BUR', name: 'Bursa Operasyon Merkezi' }],
    departments: [{ id: 'TOP', name: 'Toplama', locationId: 'IST', parentId: 'CIK' }, { id: 'SEV', name: 'Sevkiyat', locationId: 'IST', parentId: 'CIK' }, { id: 'MAL', name: 'Mal Kabul', locationId: 'IST', parentId: 'GIR' }, { id: 'STK', name: 'Stok Kontrol', locationId: 'BUR', parentId: 'GIR' }],
    orgUnits: [{ id: 'CIK', name: 'Çıkış Operasyonları Müdürlüğü', level: 2, parentId: 'LOJ', active: true }, { id: 'GIR', name: 'Giriş ve Stok Müdürlüğü', level: 2, parentId: 'LOJ', active: true }, { id: 'LOJ', name: 'Lojistik Direktörlüğü', level: 3, parentId: null, active: true }],
    people: [{ id: 'p1', code: '1001', name: 'Ece Yılmaz', deptId: 'TOP', active: true }, { id: 'p2', code: '1002', name: 'Mert Kaya', deptId: 'TOP', active: true }, { id: 'p3', code: '1003', name: 'Selin Aydın', deptId: 'SEV', active: true }, { id: 'p4', code: '1004', name: 'Can Demir', deptId: 'MAL', active: true }, { id: 'p5', code: '1005', name: 'Deniz Arslan', deptId: 'STK', active: true }, { id: 'p6', code: '1006', name: 'Bora Şahin', deptId: 'MAL', active: true }],
    users: [{ id: ownerId, name: 'Demo Yönetici', email: email || 'admin@example.com', role: 'admin', deptIds: [], active: true }, { id: 'u-top', name: 'Ayşe · Toplama', email: 'toplama@example.com', role: 'manager', deptIds: ['TOP'], active: true }, { id: 'u-sev', name: 'Emre · Sevkiyat', email: 'sevkiyat@example.com', role: 'manager', deptIds: ['SEV'], active: true }, { id: 'u-mal', name: 'Derya · Mal Kabul', email: 'malkabul@example.com', role: 'manager', deptIds: ['MAL'], active: true }, { id: 'u-stk', name: 'Okan · Stok Kontrol', email: 'stok@example.com', role: 'manager', deptIds: ['STK'], active: true }, { id: 'u-read', name: 'Rapor İzleyicisi', email: 'rapor@example.com', role: 'auditor', deptIds: [], active: true }],
    shifts: [
      { id: 'A', name: 'A', start: '07:00', end: '15:30', mealMinutes: 30, teaMinutes: 30, locationId: null, active: true },
      { id: 'B', name: 'B', start: '15:30', end: '00:00', mealMinutes: 30, teaMinutes: 30, locationId: null, active: true },
      { id: 'C', name: 'C', start: '23:30', end: '08:00', mealMinutes: 30, teaMinutes: 30, locationId: null, active: true }],
    supports: [], attendance: [], volumes: [], windows: [], events: [], notifications: [], imports: [],
    settings: { ...SETTINGS_DEFAULTS, orgLevels: ['Bölüm', 'Müdürlük', 'Direktörlük'] }, isDemo: true
  };
  const items = [['TOP', 'SEV', ['p1'], 8, 12, 'approved', 'u-top', true], ['MAL', 'TOP', ['p4'], 9, 13, 'approved', 'u-mal', true], ['TOP', 'SEV', ['p2'], 13, 17, 'pending', 'u-top', true], ['SEV', 'MAL', ['p3'], 8, 11, 'pending', 'u-sev', true], ['MAL', 'SEV', ['p4'], 14, 17, 'rejected', 'u-mal', true], ['STK', 'TOP', ['p5'], 9, 15, 'pending', 'u-stk', false], ['MAL', 'SEV', ['p6'], 14, 18, 'pending', 'u-mal', true]];
  const notes = ['Yükleme dalgası için destek', 'Sabah iş yükü dengesi', 'Öğleden sonra sevkiyat desteği', 'İade kabul desteği', 'Plan değişikliği nedeniyle reddedildi', 'Sayım öncesi planlanan destek', 'Dönem sonu operasyon desteği'];
  items.forEach((x, i) => s.supports.push({
    id: 'r' + i, code: 'DST-' + String(i + 1).padStart(4, '0'), fromDept: x[0], toDept: x[1], personIds: x[2],
    start: date + 'T' + String(x[3]).padStart(2, '0') + ':00', end: date + 'T' + String(x[4]).padStart(2, '0') + ':00',
    breakMinutes: 15, status: x[5], createdBy: x[6], submittedBy: x[6],
    // Örnek veride de kural geçerli: bitişi gelmemiş destek planlanan sayılır.
    realized: x[7] && instant(date + 'T' + String(x[4]).padStart(2, '0') + ':00') <= now,
    submittedAt: i === 6 ? old : i === 3 ? near : now.toISOString(), createdAt: now.toISOString(), note: notes[i],
    shiftId: null,
    source: x[5] === 'approved' ? 'manual' : null, reason: i === 4 ? 'İhtiyaç iptal edildi.' : '', issueResolved: false, issueHistory: [], history: []
  }));
  for (const p of s.people) s.attendance.push({ id: p.id + ':' + date, personId: p.id, date, status: p.id === 'p2' ? 'absent' : 'present', start: p.id === 'p2' ? null : date + 'T07:30', end: p.id === 'p2' ? null : date + 'T18:30', importedAt: now.toISOString() });
  record(s, s.users[0], 'Örnek çalışma alanı hazırlandı', 'Tüm kayıtlar sentetiktir.');
  return s;
}

// Kullanıcının yetkisi dışındaki verileri tarayıcıya göndermeden önce ayıklar.
export function scoped(s, u) {
  if (u.role === 'admin') return s;
  const v = structuredClone(s);
  v.supports = v.supports.filter(r => access(u, r.fromDept) || access(u, r.toDept));
  v.imports = [];
  if (u.role !== 'auditor') {
    const ids = new Set(v.supports.flatMap(r => r.personIds));
    v.people = v.people.filter(p => access(u, p.deptId) || ids.has(p.id));
    const visible = new Set(v.people.map(p => p.id));
    v.attendance = v.attendance.filter(a => visible.has(a.personId));
    v.users = v.users.filter(x => x.id === u.id);
    v.events = v.events.filter(x => x.userId ? x.userId === u.id : x.user === u.name);
    v.notifications = [];
    v.windows = v.windows.filter(w => w.scope === 'all' || w.deptIds?.some(d => access(u, d)) || w.locationIds?.some(l => s.departments.some(d => d.locationId === l && access(u, d.id))));
  }
  return v;
}

// Örnek çalışma alanı için son günlerin sentetik geçmişi (puantaj ve destek). Sabit tohumla hep aynı veri üretilir.
export function sampleHistory(s, now = new Date(), days = 28) {
  let seedValue = 20261111;
  const rand = () => { seedValue = (seedValue * 1664525 + 1013904223) % 4294967296; return seedValue / 4294967296; };
  const pick = list => list[Math.floor(rand() * list.length)];
  const managers = { TOP: 'Ayşe · Toplama', SEV: 'Emre · Sevkiyat', MAL: 'Derya · Mal Kabul', STK: 'Okan · Stok Kontrol' };
  const creators = { TOP: 'u-top', SEV: 'u-sev', MAL: 'u-mal', STK: 'u-stk' };
  const pairs = [['TOP', 'SEV'], ['MAL', 'TOP'], ['SEV', 'MAL'], ['TOP', 'MAL'], ['MAL', 'SEV'], ['SEV', 'TOP'], ['STK', 'TOP']];
  const created = [];
  for (let back = days - 1; back >= 1; back--) {
    const date = addDays(today(now), -back);
    if (new Date(date + 'T00:00:00Z').getUTCDay() === 0) continue; // pazar
    const present = new Set();
    for (const p of s.people) {
      const absent = rand() < 0.06;
      if (!absent) present.add(p.id);
      s.attendance.push({ id: p.id + ':' + date, personId: p.id, date, status: absent ? 'absent' : 'present', label: absent ? pick(['İzinli', 'Raporlu']) : 'Geldi',
        start: absent ? null : date + 'T07:30', end: absent ? null : date + 'T' + pick(['16:30', '17:30', '18:30']), hours: null, importedAt: now.toISOString() });
    }
    const used = new Set();
    const count = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < count; k++) {
      const [from, to] = pick(pairs);
      const candidates = s.people.filter(p => p.deptId === from && !used.has(p.id));
      if (!candidates.length) continue;
      // Ara sıra işe gelmeyen kişiye de destek girilmiş olsun (uyumsuz destek örneği).
      const pool = rand() < 0.08 ? candidates : candidates.filter(p => present.has(p.id));
      if (!pool.length) continue;
      const person = pick(pool);
      used.add(person.id);
      // Destekler çoğunlukla tam vardiya (A/B/C, saat ve mola sabit); ara sıra kısmi destek.
      const shiftId = pick(['A', 'A', 'A', 'B', 'B', 'C', null]);
      const sh = shiftId && s.shifts.find(x => x.id === shiftId);
      const [h1, h2] = pick([[9, 13], [13, 15], [10, 12]]);
      const times = sh ? shiftTimes(sh, date) : { start: date + 'T' + String(h1).padStart(2, '0') + ':00', end: date + 'T' + String(h2).padStart(2, '0') + ':00', breakMinutes: pick([0, 15]) };
      // Kişinin o günkü puantajı da aynı vardiyadadır (sentetik verinin tutarlı olması için).
      const att = s.attendance.find(a => a.id === person.id + ':' + date);
      if (att && att.status === 'present' && sh) Object.assign(att, { start: times.start, end: times.end, shiftId });
      const roll = rand();
      const status = roll < 0.85 ? 'approved' : roll < 0.93 ? 'rejected' : 'cancelled';
      const at = times.start;
      const delay = pick([0, 0, 1, 1, 1, 2, 3, 6]);
      const enteredDate = new Date(Math.min(instant(addDays(date, delay) + 'T' + (delay ? '09:30' : '18:00')).getTime(), now.getTime()));
      const entered = enteredDate.toISOString();
      const decided = new Date(Math.min(enteredDate.getTime() + (2 + rand() * 60) * 3600000, now.getTime())).toISOString();
      created.push({
        id: 'h' + date.replaceAll('-', '') + k, fromDept: from, toDept: to, personIds: [person.id], start: times.start, end: times.end,
        breakMinutes: times.breakMinutes, realized: instant(times.end) <= now, status, note: 'Örnek geçmiş kayıt', shiftId: shiftId || null,
        source: status === 'approved' ? (rand() < 0.2 ? 'auto' : 'manual') : status === 'rejected' ? 'manual' : null,
        decidedBy: status === 'cancelled' ? null : managers[to], decidedAt: status === 'cancelled' ? null : decided,
        reason: status === 'rejected' ? 'İhtiyaç kalmadı.' : '',
        ...(status === 'cancelled' ? { cancelKind: 'withdraw', cancelReason: 'Plan değişti.', cancelledBy: managers[from], cancelledAt: decided, cancelledFrom: 'approved' } : {}),
        // Kayıtlar genelde aynı gün akşam, ertesi gün veya ertesi hafta girilir.
        createdBy: creators[from], submittedBy: creators[from], submittedAt: entered, createdAt: entered,
        issueResolved: false, issueHistory: [], history: []
      });
    }
  }
  let n = s.supports.length;
  for (const r of created) r.code = 'DST-' + String(++n).padStart(4, '0');
  s.supports.push(...created.reverse());
  return s;
}
