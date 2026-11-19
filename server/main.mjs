import { accessResponse } from './access-view.mjs';
import { execFile } from 'node:child_process';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { applyAction, record, sampleHistory, scoped, seed } from '../lib/domain.mjs';
import { openStore } from './store.mjs';
import { graphClient, mailWorker, validAddress } from './mail.mjs';
import { backupWorker } from './backup.mjs';
import { DEMO_COOKIE, demoManager } from './demo.mjs';
import { langOf, tx } from './i18n.mjs';

// Kurulum profilleri: işletme büyüklüğüne göre hazır ayarlar. ayarlar.json içindeki 'profil' alanıyla seçilir.
export const PROFILES = {
  // kucuk: ağa HTTPS'siz açılabilir ama o durumda başka cihazdan giriş reddedilir (yalnız aynı bilgisayar çalışır).
  kucuk:    { lanHttp: true,  backupKeep: 14 },  // 1–10 kullanıcı, tek bilgisayar veya küçük yerel ağ
  orta:     { lanHttp: false, backupKeep: 30 },  // ağa açılırken HTTPS zorunlu
  kurumsal: { lanHttp: false, backupKeep: 90 }   // HTTPS, Microsoft 365, uzun yedek saklama
};

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha256 = value => createHash('sha256').update(value).digest('hex');
export const passwordHash = password => {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
};
function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex'));
}
export function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 200;
}
class RequestError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new RequestError(415,'JSON bekleniyor.');
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 6 * 1024 * 1024) throw new RequestError(413,'Dosya veya istek çok büyük.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw Error();
    return value;
  } catch {
    throw new RequestError(400,'İstek okunamadı.');
  }
}

// Demo sunucusunun arama ve paylaşım etiketleri (ör. destek.ysfdurak.com). Adres ayarlardaki baseUrl'den gelir.
export function seoHead(baseUrl) {
  const esc = v => String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const url = new URL('/', baseUrl).href;
  const title = 'Destek Merkezi · Bölümler arası işgücü desteği takibi';
  const desc = 'Vardiyalı operasyonlarda bölümler arası personel desteğini kaydeden, karşı bölüme onaylatan ve puantajla karşılaştıran ücretsiz uygulama. Örnek verili demoyu deneyin.';
  const image = 'https://ysfdurak.com/img/destek-merkezi/og.jpg';
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<link rel="alternate" hreflang="tr" href="${esc(url)}">`,
    `<link rel="alternate" hreflang="en" href="${esc(url)}?lang=en">`,
    `<link rel="alternate" hreflang="x-default" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="ysfdurak.com">`,
    `<meta property="og:locale" content="tr_TR">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`
  ].join('\n');
}

// Başka cihazdan HTTPS'siz girişte dönen ileti. Parola ve oturum çerezi ağda şifresiz gideceği için reddedilir.
export const HTTPS_REQUIRED = 'Başka bir cihazdan giriş yalnızca HTTPS ile yapılır. Bu bağlantıda parolan ağda şifresiz giderdi. Yöneticiden https:// ile başlayan adresi iste.';
const LOOPBACK = ['127.0.0.1','::1','::ffff:127.0.0.1'];
/** Bu bilgisayarın kendi adresleri: uygulama yerel ağ IP'siyle açılsa da aynı bilgisayardan gelen istek yerel sayılır. */
function ownAddresses() {
  const out = new Set(LOOPBACK);
  for (const list of Object.values(networkInterfaces())) for (const i of list ?? []) { out.add(i.address); out.add('::ffff:'+i.address); }
  return out;
}

export function createApplication(config, { send = null, ownAddress = null } = {}) {
  const host = config.host ?? '127.0.0.1';
  const port = config.port ?? 8732;
  // HTTPS: PEM anahtar + sertifika ya da Windows'ta dışa aktarılan tek .pfx dosyası (KURULUM.md).
  const secure = Boolean((config.tls?.key && config.tls?.cert) || config.tls?.pfx);
  // proxy: uygulama Caddy gibi bir ters vekilin arkasında, düz HTTP ile çalışır; HTTPS'i vekil sağlar.
  const proxy = config.proxy === true && !secure;
  const profileName = config.profil ?? 'kucuk';
  const profile = PROFILES[profileName];
  if (!profile) throw new Error('profil ayarı kucuk, orta veya kurumsal olmalı.');
  const lanHttp = !secure && !proxy && host !== '127.0.0.1';
  const isOwn = ownAddress ?? (address => ownAddresses().has(address));
  // HTTPS'siz ağ kurulumunda başka cihazdan gelen istek: arayüz açılır, giriş ve API reddedilir.
  const plainRemote = req => lanHttp && !isOwn(req.socket.remoteAddress);
  if (lanHttp && !profile.lanHttp) throw new Error('Orta ve kurumsal profilde ağa açmak için TLS sertifikası ve anahtarı gerekir.');
  const baseUrl = new URL(config.baseUrl ?? `${secure?'https':'http'}://127.0.0.1:${port}`);
  if (baseUrl.protocol !== (secure||proxy?'https:':'http:') || baseUrl.pathname !== '/' ||
      baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash ||
      (!secure && !proxy && !lanHttp && baseUrl.hostname !== '127.0.0.1')) throw new Error('baseUrl ayarı geçersiz.');
  const dbPath = resolve(ROOT,config.database ?? 'veri/destek.sqlite');
  mkdirSync(dirname(dbPath), { recursive:true });
  const mainStore = openStore(dbPath);
  const mail = send ?? graphClient(config.mail ?? {});
  if (mail.mode==='live' && (!(secure||proxy) || ['127.0.0.1','localhost','[::1]'].includes(baseUrl.hostname))) {
    throw new Error('Canlı gönderim için alıcıların erişebileceği bir HTTPS baseUrl ayarlayın.');
  }
  const tick = mailWorker(mainStore,mail,baseUrl.origin);
  const backupConfig = config.yedek ?? {};
  const backup = backupWorker(mainStore, {
    enabled: backupConfig.acik !== false && config.database !== ':memory:' && config.demo?.acik !== true,
    dir: resolve(ROOT, backupConfig.klasor ?? 'yedek'),
    keep: Number(backupConfig.saklanacak ?? profile.backupKeep),
    hour: Number(backupConfig.saat ?? 2)
  });
  const https = secure || proxy;
  const demoConfig = config.demo ?? {};
  const demo = demoConfig.acik === true ? demoManager({
    dir: resolve(ROOT, demoConfig.klasor ?? 'veri/demo'),
    ttlHours: Number(demoConfig.saat ?? 72), max: Number(demoConfig.enFazla ?? 200), perIpHour: Number(demoConfig.saatlikIpSiniri ?? 10), passwordHash
  }) : null;
  // Vekil arkasında gerçek istemci adresi: Cloudflare → CF-Connecting-IP, Caddy → X-Forwarded-For.
  const clientIp = req => proxy ? String(req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
  const loginAttempts = new Map();
  const accountAttempts = new Map();
  // Aynı hesaba 15 dakikada 5 hatalı denemeden sonra hesap geçici olarak kilitlenir (proxy arkasında da çalışır).
  const accountLocked = email => { const a = accountAttempts.get(email); return a && a.until > Date.now() && a.count >= 5; };
  const accountFailed = email => { let a = accountAttempts.get(email); if (!a || a.until < Date.now()) a = { count:0, until:Date.now()+900000 }; a.count++; accountAttempts.set(email,a); };
  const fakeHash = passwordHash(randomUUID());
  const sessionTtl = 12 * 3600000;
  const assets = new Map([
    ['/', ['index.html','text/html; charset=utf-8']],
    ['/app.js', ['app.js','text/javascript; charset=utf-8']],
    ['/app.css', ['app.css','text/css; charset=utf-8']],
    ['/favicon.svg', ['favicon.svg','image/svg+xml']],
    // Yazı tipleri sunucudan (dış adrese istek yok): DM Sans ve Manrope, SIL OFL 1.1
    ['/fonts/dm-sans-latin-wght-normal.woff2', ['fonts/dm-sans-latin-wght-normal.woff2','font/woff2']],
    ['/fonts/dm-sans-latin-ext-wght-normal.woff2', ['fonts/dm-sans-latin-ext-wght-normal.woff2','font/woff2']],
    ['/fonts/manrope-latin-wght-normal.woff2', ['fonts/manrope-latin-wght-normal.woff2','font/woff2']],
    ['/fonts/manrope-latin-ext-wght-normal.woff2', ['fonts/manrope-latin-ext-wght-normal.woff2','font/woff2']]
  ]);
  function json(res,status,data) {
    const nativeAccess = res.req.headers['x-destek-access'] === '1';
    const type = nativeAccess ? 'text/plain' : 'application/json';
    res.writeHead(status, { 'Content-Type':type+'; charset=utf-8', 'Cache-Control':'no-store' });
    // İngilizce arayüzden gelen istekte hata iletisi İngilizce döner (Access istemcisi Türkçe kalır)
    if (!nativeAccess && typeof data?.error === 'string') data = { ...data, error: tx(langOf(res.req), data.error) };
    res.end(nativeAccess ? accessResponse(data,res.req.url) : JSON.stringify(data));
  }
  const readCookie = (req,name) => new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})(?:;|$)`).exec(req.headers.cookie ?? '')?.[1];
  const cookie = req => readCookie(req,'destek_session');
  const cookies = new WeakMap();
  function addCookie(res,name,value,maxAge) {
    const list = cookies.get(res) ?? [];
    list.push(`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${https?'; Secure':''}`);
    cookies.set(res,list);
    res.setHeader('Set-Cookie',list);
  }
  const setCookie = (res,value,maxAge) => addCookie(res,'destek_session',value,maxAge);
  function newSession(res,id,store) {
    const token = randomBytes(32).toString('hex');
    store.db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    store.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(sha256(token),id,Date.now()+sessionTtl);
    setCookie(res,token,sessionTtl/1000);
  }
  function context(req,data,store) {
    if (!data) throw new RequestError(401,'AUTH');
    const token = cookie(req);
    const session = token && store.db.prepare('SELECT user_id FROM sessions WHERE token=? AND expires>?').get(sha256(token),Date.now());
    const real = data?.state.users.find(user => user.id === session?.user_id && user.active);
    if (!real) throw new RequestError(401,'AUTH');
    const canTest = data.state.isDemo && real.id === data.meta.owner;
    const testId = req.headers['x-demo-user'];
    const actor = canTest && testId ? data.state.users.find(user => user.id === testId && user.active) : real;
    if (!actor) throw new RequestError(403,'Seçilen kullanıcı aktif değil.');
    return { data, real, actor, canTest };
  }
  function payload(ctx) {
    const { data, actor, canTest } = ctx;
    return {
      state: scoped(data.state,actor), actor, revision:data.meta.revision,
      canTest, testUsers:canTest ? data.state.users : [],
      demo: demo ? { ttlHours: demo.ttlHours } : undefined,
      mail:actor.role==='admin' && !demo ? { mode:mail.mode, testRecipient:mail.testRecipient, canTest:mail.mode==='test' } : undefined,
      backup:actor.role==='admin' && !demo ? { ...backup.info(), profile:profileName } : undefined
    };
  }
  async function handler(req,res) {
    try {
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Referrer-Policy','same-origin');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      if (req.method === 'GET' && req.url === '/healthz') {
        mainStore.db.prepare('SELECT 1').get();
        res.writeHead(200, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store' });
        return res.end('ok');
      }
      // Demo sunucusunda her istek, çerezdeki anahtarın gösterdiği ziyaretçi alanında çalışır.
      let store = demo ? demo.storeFor(readCookie(req,DEMO_COOKIE)) : mainStore;
      if (req.headers.host !== baseUrl.host) throw new RequestError(421,'Uygulamayı ayarlanan adres üzerinden açın.');
      const path = new URL(req.url,baseUrl).pathname;
      if (req.method === 'GET' && assets.has(path)) {
        const [file,type] = assets.get(path);
        let body;
        try { body = readFileSync(resolve(ROOT,'public',file)); }
        catch (error) {
          // Derlenmemiş kurulumda boş 500 yerine ne yapılacağını söyle.
          if (error.code !== 'ENOENT') throw error;
          console.error(`public/${file} bulunamadı. Önce "npm run build" çalıştırın.`);
          res.writeHead(503, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store' });
          res.end('Uygulama dosyaları derlenmemiş. Sunucu klasöründe "npm run build" çalıştırıp yeniden başlatın.');
          return;
        }
        // Herkese açık demoda (DEMO_MODE) giriş sayfasına arama ve paylaşım etiketleri eklenir. Kurum kurulumunda eklenmez.
        if (demo && file === 'index.html') body = body.toString('utf8').replace('<title>Destek Merkezi</title>', seoHead(baseUrl));
        res.writeHead(200, { 'Content-Type':type, 'Cache-Control':'no-cache' });
        res.end(body);
        return;
      }
      if (req.method === 'POST' && req.headers.origin !== baseUrl.origin) throw new RequestError(403,'Geçersiz istek kaynağı.');
      if (path.startsWith('/api/') && path !== '/api/startup' && plainRemote(req)) throw new RequestError(403,HTTPS_REQUIRED);
      if (req.method === 'GET' && path === '/api/startup') {
        if (plainRemote(req)) return json(res,200,{setup:false, local:false, httpsRequired:true});
        if (demo) return json(res,200,{setup:false, local:false, demo:true, hasDemo:Boolean(store), ttlHours:demo.ttlHours});
        return json(res,200,{setup:!store.read(), local:!proxy && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)});
      }
      if (req.method === 'POST' && path === '/api/demo') {
        if (!demo) throw new RequestError(404,'Sayfa bulunamadı.');
        const { yeni } = await readJson(req);
        if (yeni === true && store) { demo.reset(readCookie(req,DEMO_COOKIE)); store = null; }
        if (store) {
          // Süresi dolmamış alana geri dönüş: yeni oturum açılır.
          newSession(res,store.read().meta.owner,store);
          demo.count('devam');
          return json(res,200,{ok:true});
        }
        let created;
        try { created = demo.create(clientIp(req), langOf(req)); }
        catch (error) { throw new RequestError(error.status ?? 500, error.status ? error.message : 'Demo alanı açılamadı.'); }
        store = created.store;
        addCookie(res,DEMO_COOKIE,created.token,demo.ttlHours*3600);
        newSession(res,created.userId,store);
        return json(res,201,{ok:true});
      }
      if (demo && ['/api/setup','/api/login','/api/password','/api/mail-test'].includes(path)) throw new RequestError(403,'Bu işlem demo sunucusunda kapalı.');
      if (req.method === 'POST' && path === '/api/setup') {
        if (proxy || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw new RequestError(403,'İlk kurulum sunucunun başında yapılır.');
        if (store.read()) throw new RequestError(409,'Çalışma alanı zaten kuruldu.');
        const { name, email, password, demo } = await readJson(req);
        if (typeof name!=='string' || !name.trim() || name.length>120 || !validAddress(email) || !validPassword(password)) throw new RequestError(400,'Ad, e-posta ve en az 12 karakterli parola gerekli.');
        const id=randomUUID();
        const state=seed(id,email.trim().toLowerCase());
        state.users[0].name=name.trim();
        state.isDemo=demo===true;
        if (state.isDemo) sampleHistory(state);
        if (!state.isDemo) {
          for (const key of ['locations','departments','people','supports','attendance','volumes','windows','notifications','events','orgUnits']) state[key]=[];
          state.settings.orgLevels=['Bölüm'];
          state.users=state.users.slice(0,1);
        }
        store.initialize(id,state,passwordHash(password));
        newSession(res,id,store);
        return json(res,201,{ok:true});
      }
      if (req.method === 'POST' && path === '/api/login') {
        const { email,password } = await readJson(req);
        const key=clientIp(req);
        let limit=loginAttempts.get(key);
        if (!limit || limit.until<Date.now()) limit={ count:0, until:Date.now()+600000 };
        if (limit.count>=30) throw new RequestError(429,'Çok fazla giriş denemesi yapıldı. 10 dakika sonra yeniden deneyin.');
        const emailKey=String(email).trim().toLowerCase();
        if (accountLocked(emailKey)) throw new RequestError(429,'Bu hesap için çok fazla hatalı deneme yapıldı. 15 dakika sonra yeniden deneyin.');
        const user=store.read()?.state.users.find(user=>user.active && user.email.toLowerCase()===String(email).trim().toLowerCase());
        const account=user && store.db.prepare('SELECT password FROM accounts WHERE user_id=?').get(user.id);
        const matches=validPassword(password) && passwordMatches(password,account?.password ?? fakeHash);
        if (!account || !matches) {
          limit.count++;
          loginAttempts.set(key,limit);
          accountFailed(emailKey);
          throw new RequestError(401,'E-posta veya parola hatalı.');
        }
        loginAttempts.delete(key);
        accountAttempts.delete(emailKey);
        newSession(res,user.id,store);
        return json(res,200,{ok:true});
      }
      if (req.method==='POST' && path==='/api/logout') {
        const token=cookie(req);
        if (token && store) store.db.prepare('DELETE FROM sessions WHERE token=?').run(sha256(token));
        setCookie(res,'',0);
        return json(res,200,{ok:true});
      }
      if (req.method==='GET' && path==='/api/state') return json(res,200,payload(context(req,store?.read(),store)));
      if (req.method==='POST' && path==='/api/password') {
        const ctx=context(req,store?.read(),store);
        const { current, next }=await readJson(req);
        const emailKey=ctx.real.email.toLowerCase();
        if (accountLocked(emailKey)) throw new RequestError(429,'Çok fazla hatalı deneme. 15 dakika sonra yeniden deneyin.');
        const account=store.db.prepare('SELECT password FROM accounts WHERE user_id=?').get(ctx.real.id);
        if (!account || !validPassword(current) || !passwordMatches(current,account.password)) { accountFailed(emailKey); throw new RequestError(400,'Mevcut parola hatalı.'); }
        if (!validPassword(next)) throw new RequestError(400,'Yeni parola 12–200 karakter olmalı.');
        if (next===current) throw new RequestError(400,'Yeni parola eskisiyle aynı olamaz.');
        store.setPassword(ctx.real.id,passwordHash(next));
        store.update(({ state })=>{ record(state,ctx.real,'Parola değiştirildi',ctx.real.email); });
        newSession(res,ctx.real.id,store);
        return json(res,200,{ok:true});
      }
      if (req.method==='POST' && path==='/api/mail-test') {
        const ctx=context(req,store?.read(),store);
        if (ctx.real.role!=='admin' || ctx.actor.role!=='admin' || mail.mode!=='test') throw new RequestError(403,'Graph test modu ve yönetici yetkisi gerekli.');
        await readJson(req);
        try {
          await mail.send({ id:randomUUID(), recipients:[mail.testRecipient], subject:'Destek Merkezi · Bağlantı testi', body:'Microsoft Graph bağlantı testi. Bu ileti personel veya puantaj verisi içermez.' });
          return json(res,200,{message:'Microsoft test e-postasını gönderime kabul etti.'});
        } catch (error) {
          throw new RequestError(502,error.kind ? error.message : 'Bağlantı testi başarısız.');
        }
      }
      if (req.method==='POST' && path==='/api/state') {
        const body=await readJson(req);
        let passwordChanged=false;
        let ctx;
        if (!store) throw new RequestError(401,'AUTH');
        const result=store.update(data=>{
          ctx=context(req,data,store);
          if (body.revision!==data.meta.revision) throw new RequestError(409,'Kayıtlar değişti. Ekranı yenileyip tekrar deneyin.');
          const p=body.payload ?? {};
          if (body.action==='definition' && p.kind==='users') {
            if (ctx.real.role!=='admin') throw new RequestError(403,'Kullanıcı yönetimi yetkiniz yok.');
            const { localPassword, id:existing, name, email, role, deptIds, active }=p.value;
            const id=existing || randomUUID();
            if (id===data.meta.owner && (role!=='admin' || active===false)) throw new RequestError(400,'Kurulum yöneticisi aktif yönetici olarak kalmalı.');
            if (localPassword && !validPassword(localPassword)) throw new RequestError(400,'Parola 12–200 karakter olmalı.');
            if (!existing && !localPassword && !data.state.isDemo) throw new RequestError(400,'Yeni kullanıcı için parola belirleyin.');
            try { applyAction(data.state,ctx.actor,'definition',{kind:'users',value:{id,name,email,role,deptIds,active}}); }
            catch (error) { throw new RequestError(400,error.message); }
            // Save first so the new account's user foreign key exists inside this transaction.
            if (localPassword) ctx.account={id,hash:passwordHash(localPassword)};
            return;
          }
          try { applyAction(data.state,ctx.actor,body.action,p); }
          catch (error) { throw new RequestError(400,error.message); }
        }, () => {
          if (ctx.account) {
            store.setPassword(ctx.account.id,ctx.account.hash);
            passwordChanged=ctx.account.id===ctx.real.id;
          }
        });
        if (!result) throw new RequestError(401,'AUTH');
        if (passwordChanged) newSession(res,ctx.real.id,store);
        ctx.data=result;
        if (body.action==='rules' && !demo) void tick().catch(console.error);
        if (demo) demo.count('islem');
        return json(res,200,payload(ctx));
      }
      throw new RequestError(404,'Sayfa bulunamadı.');
    } catch (error) {
      if (!error.status) console.error('İstek hatası:',error.message);
      if (!res.headersSent) json(res,error.status ?? 500,{error:error.status ? error.message : 'İşlem tamamlanamadı. Sunucu günlüğüne bakın.'});
    }
  }
  const server=secure ? httpsServer({
    ...(config.tls.pfx
      ? { pfx:readFileSync(resolve(ROOT,config.tls.pfx)), passphrase:config.tls.parola ?? '' }
      : { key:readFileSync(resolve(ROOT,config.tls.key)), cert:readFileSync(resolve(ROOT,config.tls.cert)) }),
    minVersion:'TLSv1.2'
  },handler) : httpServer(handler);
  return {server,store:mainStore,demo,tick,backup,host,port,baseUrl,lanHttp,proxy};
}

// Docker/VPS kurulumu: ayarlar ayarlar.json yerine ortam değişkenlerinden okunur (.env.example).
export function configFromEnv(env) {
  const flag = name => env[name] === 'true';
  const data = env.DATA_DIR ?? '/data';
  return {
    profil: 'orta',
    host: env.HOST ?? '0.0.0.0',
    port: Number(env.PORT ?? 8080),
    baseUrl: env.DESTEK_BASE_URL,
    proxy: true,
    database: resolve(data,'destek.sqlite'),
    yedek: { acik: true, klasor: resolve(data,'backups'), saklanacak: Number(env.BACKUP_KEEP ?? 30), saat: Number(env.BACKUP_HOUR ?? 2) },
    demo: { acik: flag('DEMO_MODE'), klasor: resolve(data,'demo'), saat: Number(env.DEMO_TTL_HOURS ?? 72), enFazla: Number(env.DEMO_MAX ?? 200), saatlikIpSiniri: Number(env.DEMO_PER_IP_HOUR ?? 10) },
    mail: { mode: 'off' }
  };
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const config=process.env.DESTEK_BASE_URL ? configFromEnv(process.env) : JSON.parse(readFileSync(resolve(ROOT,process.env.DESTEK_CONFIG ?? 'ayarlar.json'),'utf8').replace(/^\uFEFF/,''));
    const app=createApplication(config);
    app.server.on('error',error=>{
      console.error(error.code==='EADDRINUSE'?'Bu port kullanımda. Destek Merkezi zaten açık olabilir.':error.message);
      process.exitCode=1;
    });
    app.server.listen(app.port,app.host,()=>{
      console.log(`Destek Merkezi hazır: ${app.baseUrl.origin}\nArka plan kontrolleri bu pencere açık kaldığı sürece çalışır.`);
      if (app.lanHttp) console.warn('UYARI: Uygulama yerel ağa HTTPS olmadan açık. Yalnız bu bilgisayardan giriş yapılabilir; başka cihazlar HTTPS gerektiği iletisini görür. HTTPS kurulumu: KURULUM.md › Yerel ağa açma.');
      if (process.platform==='win32' && process.argv.includes('--open')) {
        execFile('rundll32.exe',['url.dll,FileProtocolHandler',app.baseUrl.origin],error=>{
          if (error) console.error('Tarayıcı açılamadı. Yukarıdaki adresi tarayıcıya yazın.');
        });
      }
      const check=()=>{ app.backup.run(); app.demo?.cleanup(); return app.tick().catch(error=>console.error('Arka plan hatası:',error.message)); };
      void check();
      setInterval(check,60000);
    });
  } catch(error) {
    console.error(error.message);
    process.exitCode=1;
  }
}
