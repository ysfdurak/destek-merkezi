import { due, record, runRules } from '../lib/domain.mjs';

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const GUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const SYSTEM = { name: 'Sistem' };
export const validAddress = value => typeof value === 'string' && ADDRESS.test(value) && value.length <= 254;

export function graphClient(config, { fetcher = fetch, secret = process.env.DESTEK_GRAPH_SECRET } = {}) {
  const mode = config.mode ?? 'off';
  if (!['off','test','live'].includes(mode)) throw new Error('E-posta modu off, test veya live olmalı.');
  if (mode !== 'off' && (!GUID.test(config.tenantId ?? '') || !GUID.test(config.clientId ?? '') || !validAddress(config.sender) || !secret)) {
    throw new Error('Graph ayarları eksik. Tenant ID, Client ID, gönderen adresi ve DESTEK_GRAPH_SECRET gerekir.');
  }
  if (mode === 'test' && !validAddress(config.testRecipient)) throw new Error('Test alıcısı geçersiz.');
  const domains = Array.isArray(config.allowedRecipientDomains) ? config.allowedRecipientDomains.map(domain => String(domain).toLowerCase().trim()) : [];
  if (mode === 'live' && (!domains.length || domains.some(domain => !validAddress('recipient@' + domain)))) {
    throw new Error('Canlı gönderim için allowedRecipientDomains alanında kurumun e-posta alan adlarını belirtin.');
  }
  const allows = address => validAddress(address) && domains.includes(address.split('@')[1].toLowerCase());
  let token = '';
  let expires = 0;
  const failure = (message, kind, retryAfter) => Object.assign(new Error(message), { kind, retryAfter });

  async function accessToken() {
    if (Date.now() < expires) return token;
    let response;
    try {
      response = await fetcher(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        body: new URLSearchParams({
          client_id: config.clientId, client_secret: secret,
          grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default'
        }),
        signal: AbortSignal.timeout(12000)
      });
    } catch {
      throw failure('Microsoft kimlik servisine ulaşılamadı.', 'retry');
    }
    if (!response.ok) throw failure(`Microsoft kimlik servisi HTTP ${response.status} döndürdü.`, response.status === 429 || response.status >= 500 ? 'retry' : 'failed');
    const data = await response.json().catch(() => ({}));
    if (!data.access_token) throw failure('Microsoft erişim anahtarı yanıtı geçersiz.', 'failed');
    token = data.access_token;
    expires = Date.now() + Math.max(0, (Number(data.expires_in) - 90) * 1000);
    return token;
  }

  return {
    mode,
    testRecipient: config.testRecipient,
    allows,
    async send({ recipients, subject, body, id }) {
      if (mode === 'off') throw failure('E-posta gönderimi kapalı.', 'failed');
      if (mode === 'test' && (recipients.length !== 1 || recipients[0] !== config.testRecipient)) {
        throw failure('Test modunda yalnızca ayarlı test alıcısı kullanılabilir.', 'failed');
      }
      if (mode === 'live' && (!recipients.length || !recipients.every(allows))) {
        throw failure('Alıcı adresi izin verilen kurum alan adında değil.', 'failed');
      }
      const authorization = await accessToken();
      let response;
      try {
        response = await fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authorization}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: 'Text', content: body },
              toRecipients: recipients.map(address => ({ emailAddress: { address } })),
              internetMessageHeaders: [{ name: 'x-destek-notification-id', value: id }]
            },
            saveToSentItems: true
          }),
          signal: AbortSignal.timeout(15000)
        });
      } catch {
        throw failure('Gönderim yanıtı alınamadı. Gönderilmiş Öğeler kontrol edilmeli.', 'uncertain');
      }
      if (response.status === 202) return;
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after'));
        throw failure('Microsoft istek sınırına ulaşıldı.', 'retry', seconds > 0 ? seconds : 60);
      }
      if (response.status >= 500) throw failure(`Graph HTTP ${response.status}. Gönderilmiş Öğeler kontrol edilmeli.`, 'uncertain');
      if (response.status === 401) expires = 0;
      throw failure(`Graph gönderimi kabul etmedi (HTTP ${response.status}). Gönderen ve uygulama izinlerini kontrol edin.`, 'failed');
    }
  };
}

function eligibleRecipients(state, notice, now) {
  const support = state.supports.find(row => row.id === notice.requestId);
  if (!support || support.status !== 'pending' || !state.settings.autoApprove ||
      notice.key !== support.id + ':' + support.submittedAt || due(state,support) <= now) return [];
  const remaining = due(state,support).getTime() - now.getTime();
  if (remaining > state.settings.reminderHours * 3600000) return null;
  return [...new Set(state.users.filter(user =>
    user.active && user.role === 'manager' && user.id !== support.createdBy &&
    user.deptIds.includes(support.toDept) && validAddress(user.email)
  ).map(user => user.email.toLowerCase()))];
}

export function mailWorker(store, mail, baseUrl) {
  let active = false;
  function updateNotice(id, fn) {
    store.update(({ state }) => {
      const notice = state.notifications.find(row => row.id === id);
      if (!notice) return false;
      fn(notice, state);
    });
  }
  return async function tick(now = new Date()) {
    if (active) return;
    active = true;
    try {
      const result = store.update(({ state }) => {
        const rules = runRules(state, SYSTEM, now);
        return Boolean(rules.approved || rules.queued);
      });
      if (!result || result.state.isDemo || mail.mode !== 'live') return;
      for (const item of result.state.notifications) {
        if (!['draft','retry','sending'].includes(item.status)) continue;
        let claimed;
        store.update(({ state }) => {
          const notice = state.notifications.find(row => row.id === item.id);
          if (notice.status === 'sending' && now.getTime() - Date.parse(notice.attemptedAt) > 120000) {
            notice.status = 'uncertain';
            notice.error = 'Gönderim sırasında bağlantı kesildi. Gönderilmiş Öğeler kontrol edilmeli.';
            return;
          }
          if (!['draft','retry'].includes(notice.status) || Date.parse(notice.nextAttemptAt) > now.getTime()) return false;
          const eligible = eligibleRecipients(state,notice,now);
          if (eligible === null) return false;
          const recipients = mail.allows ? eligible.filter(mail.allows) : eligible;
          if (!recipients.length) {
            notice.status = 'skipped';
            notice.error = 'Kayıt artık beklemiyor, süre doldu veya yetkili alıcı bulunamadı.';
            return;
          }
          notice.status = 'sending';
          notice.recipients = recipients;
          notice.attemptedAt = new Date().toISOString();
          notice.attempts = (notice.attempts ?? 0) + 1;
          const support = state.supports.find(row => row.id === notice.requestId);
          const deadline = due(state,support);
          notice.deadline = deadline.toISOString();
          notice.body = `${support.code} numaralı destek kaydı için son onay veya ret zamanı ${deadline.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}.\n\nOnay kutusu: ${baseUrl}/?sayfa=onay`;
          claimed = { ...notice };
        });
        if (!claimed) continue;
        try {
          await mail.send(claimed);
          updateNotice(claimed.id, (notice, state) => {
            notice.status = 'accepted';
            notice.sentAt = new Date().toISOString();
            notice.error = '';
            record(state, SYSTEM, 'E-posta gönderimi kabul edildi', notice.subject);
          });
        } catch (error) {
          updateNotice(claimed.id, (notice, state) => {
            notice.status = error.kind === 'retry' && notice.attempts < 4 ? 'retry' : error.kind === 'uncertain' ? 'uncertain' : 'failed';
            notice.error = error.kind ? error.message : 'Gönderim sonucu doğrulanamadı.';
            if (!error.kind) notice.status = 'uncertain';
            if (notice.status === 'retry') notice.nextAttemptAt = new Date(Date.now() + Math.max(error.retryAfter ?? 120, 60) * 1000).toISOString();
            record(state, SYSTEM, 'E-posta gönderim durumu', notice.subject + ' · ' + notice.error);
          });
        }
      }
    } finally {
      active = false;
    }
  };
}
