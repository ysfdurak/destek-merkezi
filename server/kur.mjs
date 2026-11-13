// Kurum çalışma alanının ilk yöneticisini sunucuda oluşturur (Docker / VPS kurulumu).
// Tarayıcıdaki ilk kurulum yalnızca sunucunun başında açılır; vekil (Caddy) arkasında kapalıdır.
//   docker exec -it destek node server/kur.mjs
// Boş çalışma alanı kurar. Örnek verilerle denemek için: node server/kur.mjs --ornek
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore } from './store.mjs';
import { passwordHash, validPassword } from './main.mjs';
import { validAddress } from './mail.mjs';
import { sampleHistory, seed } from '../lib/domain.mjs';

if (process.env.DEMO_MODE === 'true') {
  console.error('DEMO_MODE=true iken kurum çalışma alanı kullanılmaz. Önce .env içinde DEMO_MODE=false yapın.');
  process.exit(1);
}
const store = openStore(resolve(process.env.DATA_DIR ?? '/data', 'destek.sqlite'));
if (store.read()) {
  console.error('Çalışma alanı zaten kurulu. Yeni yöneticileri uygulamada Tanımlar → Kullanıcı ve yetkiler ekranından ekleyin.');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
// Parola yazılırken ekranda görünmesin.
let muted = false;
const write = rl._writeToOutput?.bind(rl);
if (write) rl._writeToOutput = text => write(muted && !/^[\r\n]+$/.test(text) ? '' : text);
const lines = rl[Symbol.asyncIterator]();
const ask = async prompt => { process.stdout.write(prompt); const { value } = await lines.next(); return value ?? ''; };

const name = (await ask('Ad soyad: ')).trim();
const email = (await ask('E-posta: ')).trim().toLowerCase();
muted = true;
const password = await ask('Parola (en az 12 karakter, görünmez): ');
muted = false;
process.stdout.write('\n');
rl.close();

if (!name || name.length > 120 || !validAddress(email) || !validPassword(password)) {
  console.error('Ad, geçerli bir e-posta ve 12–200 karakterli parola gerekli.');
  process.exit(1);
}
const id = randomUUID();
const state = seed(id, email);
state.users[0].name = name;
state.isDemo = process.argv.includes('--ornek');
if (state.isDemo) sampleHistory(state);
else {
  for (const key of ['locations', 'departments', 'people', 'supports', 'attendance', 'volumes', 'windows', 'notifications', 'events', 'orgUnits']) state[key] = [];
  state.settings.orgLevels = ['Bölüm'];
  state.users = state.users.slice(0, 1);
}
store.initialize(id, state, passwordHash(password));
console.log(`Çalışma alanı kuruldu. ${email} ile giriş yapabilirsiniz.`);
