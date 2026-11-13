import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, LockKeyhole, PlayCircle, RotateCcw } from 'lucide-react';

export default function LocalAccess({ onReady }: { onReady: () => void }) {
  const [startup,setStartup] = useState<{setup:boolean;local:boolean;demo?:boolean;hasDemo?:boolean;ttlHours?:number}|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [demo,setDemo] = useState(true);
  useEffect(() => {
    fetch('/api/startup').then(async response => {
      if (!response.ok) throw new Error('Sunucuya bağlanılamadı.');
      setStartup(await response.json());
    }).catch(error => setError(error.message));
  }, []);
  const setup = startup?.setup;
  async function startDemo(fresh: boolean) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ yeni: fresh }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onReady();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  if (startup?.demo) {
    const days = Math.round((startup.ttlHours ?? 72) / 24);
    return <main className="local-access">
      <section className="local-access-card">
        <div className="brand-mark"><ArrowLeftRight size={25}/></div>
        <p className="eyebrow">CANLI DEMO</p>
        <h1>Destek Merkezi</h1>
        <p>Departmanlar arası işgücü desteğini kaydeden, onaylatan ve puantajla karşılaştıran sistem. Kurgusal bir depo organizasyonuyla dolu, yalnızca sana ait bir çalışma alanı açılır.</p>
        {error && <div className="alert danger" role="alert">{error}</div>}
        <div className="demo-start">
          {startup.hasDemo && <button className="button primary" disabled={busy} onClick={() => startDemo(false)}><PlayCircle size={17}/>Kaldığın yerden devam et</button>}
          <button className={'button' + (startup.hasDemo ? '' : ' primary')} disabled={busy} onClick={() => startDemo(true)}>{startup.hasDemo ? <RotateCcw size={16}/> : <PlayCircle size={17}/>}{busy ? 'Hazırlanıyor…' : startup.hasDemo ? 'Yeni demo alanı aç' : 'Örnek verilerle dene'}</button>
        </div>
        <ul className="demo-notes">
          <li>Kayıt veya giriş gerekmez. Üstteki "Yetki akışını dene" ile yönetici, bölüm yöneticisi ve izleyici rollerini değiştirebilirsin.</li>
          <li>Tüm kişi ve kayıtlar sentetiktir; kimseye e-posta gitmez.</li>
          <li>Alan, son kullanımdan {days} gün sonra tümüyle silinir.</li>
        </ul>
      </section>
    </main>;
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(setup ? '/api/setup' : '/api/login', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ name:form.get('name'), email:form.get('email'), password:form.get('password'), demo })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onReady();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return <main className="local-access">
    <section className="local-access-card">
      <div className="brand-mark"><ArrowLeftRight size={25}/></div>
      <p className="eyebrow">YEREL ÇALIŞMA ALANI</p>
      <h1>{setup ? 'Destek Merkezi’ni kur' : 'Destek Merkezi'}</h1>
      <p>{setup ? 'Bir yönetici hesabı oluştur ve çalışma alanını seç.' : 'Kurum içi çalışma alanına giriş yap.'}</p>
      {error && <div className="alert danger" role="alert">{error}</div>}
      {startup && (setup && !startup.local ? <div className="alert"><LockKeyhole size={18}/>İlk kurulumu uygulamanın çalıştığı makinede yapın.</div> : <form onSubmit={submit}>
        {setup && <label>Ad soyad<input name="name" autoComplete="name" maxLength={120} required/></label>}
        <label>E-posta<input name="email" type="email" autoComplete="username" maxLength={254} required/></label>
        <label>Parola<input name="password" type="password" autoComplete={setup?'new-password':'current-password'} minLength={12} maxLength={200} required/></label>
        {setup && <fieldset className="setup-mode">
          <legend>Çalışma alanı</legend>
          <label><input type="radio" checked={demo} onChange={()=>setDemo(true)} /> Örnek verilerle dene</label>
          <label><input type="radio" checked={!demo} onChange={()=>setDemo(false)} /> Boş çalışma alanı oluştur</label>
        </fieldset>}
        <button type="submit" className="button primary" disabled={busy}>{busy?'Bekleyin…':setup?'Çalışma alanını oluştur':'Giriş yap'}</button>
      </form>)}
      <p className="local-access-note"><LockKeyhole size={14}/> Kayıtlar uygulamanın çalıştığı makinede tutulur.</p>
    </section>
  </main>;
}
