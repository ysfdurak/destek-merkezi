# Destek Merkezi · Değişiklikler ve kod rehberi

## Yedek ayarı doğrulaması · 23 Kasım 2026 (1.7.2)

- **Ne değişti:** `yedek.saklanacak` (ya da `BACKUP_KEEP`) 0 veya geçersizken sunucu açılmaz, hata verir. Önceden yedek alınıyor, hemen ardından eski kopyalarla birlikte siliniyordu; ekranda "son yedek" görünse de klasör boştu.
- **Kural:** `saklanacak` 1–3650 arası tam sayı, `saat` 0–23 arası tam sayı. Yedek kapalıyken (`acik: false`) bu alanlara bakılmaz.
- **Nerede:** `server/backup.mjs` başındaki iki kontrol; test `tests/v11.test.mjs` → "D13".
- **Sorulursa:** "Neden sessizce düzeltmiyor?" — 0 bir yazım hatası da olabilir, bilinçli bir "yedek istemiyorum" da. İkisini ayırmak için açıkça hata verip `acik: false`'u gösteriyoruz.

## Demoda ölçüm ve geri bildirim · 23 Kasım 2026 (1.7.1)

- **Ne değişti:** Herkese açık demo (`DEMO_MODE=true`) ortak ölçüm servisine bağlandı. Sayfanın sağ altında "Geri bildirim ver" düğmesi var; servis yüklenmezse düğme görünmez.
- **Nasıl çalışıyor:**
  - Sunucu yalnız demoda `index.html`'e `public/olcum.js`'i ekler ve CSP'de `script-src` ile `connect-src`'ye yalnız `https://olcum.ysfdurak.com`'u açar (`server/main.mjs`).
  - Yükleyici yalnız `destek.ysfdurak.com`'da çalışır.
  - Ekran adını uygulama bildirir: `app/ui.tsx` → `olcumKuyruk.push(['ekran', page])`.
- **Neden böyle:** Kurum kurulumunda çalışan takibi izlenimi doğmasın diye ölçüm yalnız demoda var. Kayıt içeriği hiç gönderilmez.
- **Test:** `tests/demo.test.mjs`. Demoda betik ve CSP eklenir; `DEMO_OLCUM=false` iken ikisi de yoktur.

## Windows hazır paketi · 22 Kasım 2026 (1.7.0)

- **Önceki durum:** İndiren kişinin Node.js 24 kurması, ilk açılışta internetten `npm ci` ve `npm run build` çalıştırması gerekiyordu.
- **Şimdi:** Sürümler sayfasında `destek-merkezi-<sürüm>-windows-x64.zip` var. Zip açılır, **Baslat.cmd** çift tıklanır; Node.js kurulumu ve internet gerekmez.
- **Yöntem:** Node.js'in resmî taşınabilir Windows zip'i (nodejs.org, sürüm ve SHA-256 `paket/paketle.ps1` içinde sabit) uygulamayla birlikte paketlenir; yalnız `node.exe` ve lisansı `runtime\node\` klasörüne girer. `Baslat.cmd` bu dosya varsa onu, yoksa bilgisayardaki Node.js'i kullanır.
- **Neden tek dosyalı .exe (Node SEA) değil:** SEA, Node 24'te tek CommonJS giriş dosyası ister; sunucu ESM modüllerinden oluşur ve `public`, `schema.sql`, `en.json` gibi dosyaları paket köküne göre (`import.meta.url`) okur, veri, yedek ve ayarlar da kökte durur. SEA için hepsini paketleyip yolları değiştirmek gerekirdi. İmzasız tek .exe, SmartScreen ve virüs tarayıcılarında da daha sık takılır; `node.exe` ise OpenJS Foundation imzalıdır. Taşınabilir Node ile kod hiç değişmedi, Access istemcisi ve `AgaAc.cmd` aynı klasör düzeniyle çalışır.
- **Paketleme notu:** Ayrıntı ve elle üretme: [KURULUM.md › Hazır paket nasıl üretilir](../KURULUM.md#hazır-paket-nasıl-üretilir). CI (`.github/workflows/windows-paket.yml`) paketi gerçek Windows makinesinde açıp PATH'te Node.js yokken sunucunun HTTP 200 verdiğini denetler. İzinler varsayılan `contents: read`; yalnız sürüme dosya ekleyen işte `contents: write`; `checkout` kimlik bilgisini saklamaz (`persist-credentials: false`).
- **Access istemcisi, gerçek Windows denemesi (22.11.2026):** Paket ve Access 2016+ ile giriş, kayıt listesi, onay ve yeni destek akışı çalıştı. Bulunan hata: GitHub zip'inden ya da Linux'ta üretilen paketten gelen `Sunucu_Adresi.txt` LF satır sonuyla geliyor; VBA `Line Input` LF'yi ayırmadığı için adres "HTTPS veya yerel 127.0.0.1 olmalı" hatasıyla reddediliyor ve **Giriş yap** kapalı kalıyordu. `Access_Form.vba` artık LF, CR ve UTF-8 BOM'u temizliyor; `.gitattributes` `*.txt` ve `*.bat` dosyalarını CRLF ile çıkarıyor.
- **Node.js güncellemesi:** Güvenlik sürümü çıktığında `paket/paketle.ps1` içindeki `NodeSurum` ve `NodeSha256` birlikte güncellenip yeni sürüm yayımlanır.

## Başka cihazdan giriş HTTPS ister · 19 Kasım 2026 (1.6.0)

- **Sahte IP başlığı:** Sunucu (VPS) demosunda IP başına saatlik demo alanı sınırı `CF-Connecting-IP` / `X-Forwarded-For` başlığının ilk değerinden okunuyordu; alan adı Cloudflare'den geçmiyorsa herkes bu başlığı yazıp sınırı aşabilirdi. `server/gercek-ip.mjs` başlıkları yalnız güvenilen vekilden (özel ağdaki Caddy, Cloudflare aralıkları) kabul eder. Test: `tests/gercek-ip.test.mjs`.

- **Önceki durum:** Küçük işletme profili yerel ağa HTTP ile açılabiliyordu. Telefondan veya ikinci bilgisayardan girişte parola ve oturum çerezi ağda şifresiz gidiyordu.
- **Şimdi:** HTTPS'siz kurulumda yalnız uygulamanın kurulu olduğu bilgisayardan giriş yapılır. Başka bir cihaz giriş ekranında "bağlantı şifreli değil, https:// adresini iste" uyarısını görür; giriş ve bütün API istekleri `HTTPS_REQUIRED` iletisiyle reddedilir. Daha önce alınmış bir oturum çerezi de HTTP üzerinden işe yaramaz.
- **HTTPS kolaylaştı:** `tls.pfx` + `tls.parola` ile Windows'ta PowerShell'le üretilen tek sertifika dosyası kullanılabilir (KURULUM.md). PEM (`tls.key` + `tls.cert`) desteği sürer.
- **Kodda:** `server/main.mjs` › `plainRemote(req)`: ağ kurulumu HTTPS'siz ve istek bu bilgisayarın kendi adreslerinden (`os.networkInterfaces`) gelmiyorsa doğru. `/api/startup` bu durumda `httpsRequired: true` döner; `app/local-access.tsx` uyarıyı gösterir ve formu gizler.
- **Kabul testi** (`tests/https.test.mjs`): HTTPS'siz kurulumda aynı bilgisayar kurulum, giriş ve işlem yapar; başka cihaz oturum açamaz ve ele geçen çerezle de erişemez. HTTPS (.pfx) ile başka cihazdaki yetkili kullanıcı giriş yapıp kayıtları okur.

## İngilizce arayüz · 15 Kasım 2026 (1.5.0)

- **Ne:** `?lang=en` ya da kenar çubuğundaki **English** düğmesiyle tüm arayüz, raporlar, Excel çıktıları ve sunucu hata iletileri İngilizce; İngilizce sayfadan açılan demo alanı İngilizce örnek verilerle gelir.
- **Nasıl:** Kaynak Türkçe kaldı. `npm run build` artık `ceviri/derle.mjs`'i çalıştırır: esbuild derlerken sözlükte (`lib/i18n/en.json`, ~1.000 kayıt) karşılığı olan metinleri dile göre seçilen çağrılara çevirir. Sunucu aynı sözlüğü `server/i18n.mjs` ile kullanır. Ayrıntı ve dikkat edilecekler: [CEVIRI.md](CEVIRI.md).
- **Kod değişiklikleri:** `lib/org.mjs` çoğul/küçük harf kuralı dile bağlı; yüzde biçimi dile bağlı; `lib/import.mjs`'e İngilizce eş adlar (`staff id`, `hours`, `working time`); `server/demo.mjs` dil parametresi.
- **Türkçe kalan:** Access istemcisi, e-postalar.
- Kontrol: 48 test (4'ü yeni) geçti; demo sunucusunda 11 ekran İngilizce tarandı, sayfa hatası yok.

## Okunabilirlik ve erişilebilirlik · 15 Kasım 2026 (1.4.2)

- **Renk karşıtlığı:** `app/globals.css` içindeki soluk gri/yeşil yazı renkleri, açık zeminlerde (en koyusu `#e4eeea`) en az 4,6:1 karşıtlığa gelecek şekilde aynı tonda koyulaştırıldı; koyu zemindeki beyaz yazılara dokunulmadı. `--muted` `#5b696d` oldu; menüde seçili öğe `--teal-dark`.
- **Yazı boyutu:** 10 pikselin altındaki tüm yazılar (tablo başlıkları, rozetler, dipnotlar; 57 yer) 10,5 piksele çekildi.
- **Tablolar:** başlığı boş sütunlara ekran okuyucu için ad verildi (`.sr-only`: İşlemler, Bölüm, Bilgi).
- Kontrol: axe (WCAG 2 A/AA) demo girişinde ve 10 ekranda masaüstü + telefon 0 ihlal; 44 test geçti.

## Yayın altyapısı · 13 Kasım 2026

Uygulama GitHub'a ve ysfdurak.com sunucusuna hazırlandı. Testler 44 ve hepsi geçiyor.

- **Docker:** `Dockerfile` iki aşamalıdır: arayüz derlenir, çalışan imaja yalnızca sunucu girer. Konteyner `node` kullanıcısıyla çalışır, `/healthz` ile sağlık kontrolü yapılır.
- **Vekil (proxy) modu:** Uygulama Caddy'nin arkasında düz HTTP ile çalışır. Adres `https://` olur, çerezler `Secure` ayarlıdır. İstemci IP'si `CF-Connecting-IP` veya `X-Forwarded-For` başlığından okunur. Ayarlar `.env` dosyasından gelir (`configFromEnv`).
- **Ziyaretçi demo alanları (`DEMO_MODE=true`):**
  - Her ziyaretçi, giriş yapmadan, örnek verili ve yalnızca kendisine ait bir alan açar.
  - Alan ayrı bir SQLite dosyasıdır. Son kullanımdan 72 saat sonra silinir.
  - En fazla 200 alan açılabilir; bir IP adresi saatte en fazla 10 alan açabilir.
  - Giriş, kurulum, parola ve e-posta kapalıdır.
  - Günlük sayaçlar yalnızca adet tutar.
  - Kodda: `server/demo.mjs`. Sunucu her isteği, çerezdeki anahtarın gösterdiği alanda çalıştırır; alan istek başına seçilir, istekler arasında paylaşılmaz.
- **Kurum modunda ilk yönetici:** Vekil arkasında tarayıcıdan ilk kurulum kapalıdır. Yönetici `node server/kur.mjs` komutuyla oluşturulur.
- **GitHub Actions:** Testleri çalıştırır, imajı derler ve konteyneri demo modunda dener.
- **Düzeltme:** Bir test, gece yarısından sonra (İstanbul saati) UTC tarihini kullandığı için başarısız oluyordu. Test artık İstanbul tarihini kullanıyor.

## V1.4 · 12 Kasım 2026

V1.4 çok düzeyli organizasyon hiyerarşisi ekler. Testler 41 ve hepsi geçiyor.

### Düzeyleri siz belirlersiniz

- **Yer:** Tanımlar → Hiyerarşi.
- **Ad ve derinlik:** Düzeyler en alttan üste doğru adlandırılır, en fazla 6 düzey olabilir. Örnekler: "Takım → Bölüm → Müdürlük" veya "Bölüm → Müdürlük → Direktörlük".
- **1. düzey:** Personelin bağlı olduğu ve desteğin aktığı birimdir; mevcut bölüm tanımları bu düzeydir. Adı değişince menü, form, filtre ve rapor başlıkları da değişir (ör. "Takımlar", "Destek veren takım").
- **Üst düzeyler:** Her düzeyin kendi birim listesi vardır: ad, kod ve bağlı olduğu bir üst birim. 1. düzey birimi bir 2. düzey birime, o da bir 3. düzey birime bağlanır.
- **Ağaç görünümü:** Tüm yapı tek ekranda görülür. Bağlanmamış birimler "Atanmamış" altında toplanır ve ekranda uyarı çıkar.
- **Kısıtlar:** Kodlar tüm hiyerarşide benzersizdir. Üstünde birim bulunan en üst düzey kaldırılamaz, altında birim bulunan birim de silinemez.
- **Yeni kurulum:** Tek düzeyle ("Bölüm") başlar. Örnek veride Bölüm → Müdürlük → Direktörlük hazır gelir.

### Dashboard ve raporlarda hiyerarşi

- **Hiyerarşi filtresi:** Bir üst düzey ve o düzeyden birimler seçilir (ör. Müdürlük = Çıkış Operasyonları). 1. düzey seçici yalnızca bu birimlerin altındakileri gösterir.
- **Gruplama düzeyi:** Tüm sayılar, veren–alan matrisi, takvim, onay süresi, gecikme ve birim tablosu seçilen düzeyde toplanır.
- **İç destek:** Aynı üst birim içindeki 1. düzey birimler arasındaki destek, o birim için hem verilen hem alınan sayılır ve matrisin köşegeninde görünür.
- **Rapor merkezi:** Aynı filtre ve gruplama düzeyi rapor merkezinde de vardır. "Birim raporu" seçilen düzeyde üretilir. Destek kayıt listesinde her kayıt için veren ve alan tarafın tüm üst birimleri ayrı sütunlarda yer alır, böylece Excel'de pivotlanabilir.

### Yetki

Yöneticiler hâlâ 1. düzey birimlere yetkilendirilir. Bir müdüre müdürlüğün tamamını vermek için müdürlüğün altındaki birimler tek tek seçilir. "Müdürlük düzeyinde yetki" ileride eklenebilir.

### Kodda

- `lib/org.mjs`: `levels`, `unitsOf`, `ancestorAt`, `deptsUnder`, `pathNames` ve `rollup` fonksiyonları burada. `rollup`, durumu seçilen düzeye taşır; böylece dashboard ve rapor hesapları değişmeden çalışır.
- `applyAction`: `orgLevels` ve `deleteOrgUnit` eylemleri ile `definition` → `orgUnits` eklendi.
- Arayüz: `app/org-editor.tsx` ve `app/org-filter.tsx`.
- Veri: `orgUnits` tablosu (`server/schema.sql`).

## V1.3 · 12 Kasım 2026

V1.3, kullanımdan gelen düzeltmeleri ve büyük işletme ölçeğini kapsar. Testler 40 ve hepsi geçiyor. Ayrıca 3 lokasyon, 50 bölüm, 500 personel, 5.725 destek ve 38.500 puantaj satırıyla denendi:

- Giriş ve ilk yükleme: yaklaşık 1 sn
- Dashboard: 0,8 sn
- Altı raporun tek Excel dosyası: 0,6 sn

### Talep bilgisi kaldırıldı

V1.2'de eklenen talep kanalı ve talep eden alanları formlardan, toplu girişten, dashboard'dan ve raporlardan çıkarıldı. Eski kayıtlardaki değerler silinmez, yalnızca kullanılmaz.

### Aynı gün tekrar giriş engeli

Bir kişinin bir tarihte aktif (bekleyen, onaylı veya planlanan) destek kaydı varsa, aynı tarihe ikinci kayıt girilemez; saatler çakışmasa da. Hata mesajı mevcut kaydın numarasını verir. Reddedilen ve iptal edilen kayıtlar engel olmaz. Toplu girişte aynı kişinin aynı gün iki satırı veya mevcut kaydı varsa satır turuncu işaretlenir.

Kodda: `applyAction` → `support`, "aynı kişiye aynı gün" kontrolü.

### Vardiyalar: A, B, C ve sabit destek

- **Tanım:** Vardiyalar bir kez tanımlanır (Tanımlar → Vardiyalar): kod (A, B, C; tek harf olabilir), başlangıç ve bitiş saati, **yemek molası** ve **çay molası** (dakika), isteğe bağlı lokasyon.
- **Hazır gelenler:** A 07:00–15:30, B 15:30–00:00, C 23:30–08:00; her birinde 30 dk yemek + 30 dk çay molası var.
- **Sabit süre:** Vardiyalı destekte saat ve mola vardiyadan gelir ve değiştirilemez. 8:30'luk vardiyada 1 saat mola varsa destek kişi başı 7:30 sayılır. Formda yalnızca tarih seçilir; sunucu saatleri ve molayı kendisi hesaplar, istemci farklı saat gönderse bile vardiya saatleri uygulanır.
- **Kısmi destek:** Vardiyanın bir kısmındaki destek için "Vardiya dışı / kısmi" seçilir; saat ve mola elle girilir.
- **Gece yarısını aşan vardiya:** Başladığı güne aittir.

Kodda: `shiftTimes()`, `shiftBreak()`, `definition` → `shifts`.

### Toplu girişte kişileri sabitle

Toplu girişteki **Kişileri sabitle, günleri seç** bölümünde:

1. Kişiler işaretlenir.
2. Başlangıç ve bitiş tarihi seçilir (en fazla 31 gün, istenirse pazarlar atlanır).
3. Vardiya seçilir; vardiyasızsa saat ve mola girilir.
4. **Satırları oluştur** ile her kişi ve her gün için satır oluşur.

Satırlar onaya gönderilmeden önce tabloda görülür; her satırda net süre yazar. Aynı tarih ve vardiyadaki kişiler tek kayıtta birleşir. Örnek: 2 kişi × 3 gün = 6 satır, 3 destek kaydı.

Kodda: `app/bulk.tsx`.

### 50 bölümlük işletme için ekranlar

| Yer | Değişiklik |
|---|---|
| Bölüm seçimi | Dashboard ve rapor merkezinde aranabilir çoklu bölüm seçici: arama, "bulunanları ekle", lokasyona göre tek tıkla seçim, tümü |
| Gösterim | "En yoğun 10 / 20 / 50 bölüm / tümü"; takvim, onay süresi ve bölüm tablosu bu sınırla gösterilir, gizlenen bölüm sayısı yazılır |
| Kim kime destek verdi | 12'den fazla bölüm varsa matris yerine en yoğun veren → alan akışları listesi; matrisin tamamı Excel'de |
| Bölüm tablosu | Arama ve sütun başlığına tıklayarak sıralama |
| Genel bakış | Bölüm dağılımında en yoğun 8 bölüm; diğerleri Dashboard'da |
| Uzun metinler | Gecikme notunda ilk 5 bölüm; personel satırında ilk 3 bölüm ve "+N" |

Kodda: `app/dept-picker.tsx`, `app/dashboard.tsx` (`FlowTable`, `DeptTable`, `Heatmap`).

### V1.3 için sık sorulabilecek sorular

**Vardiyalı bir desteğin saatini neden değiştiremiyorum?**
Vardiyalı destek sabittir; saat ve mola vardiya tanımından gelir. Farklı saatler için "Vardiya dışı / kısmi" seçin ya da vardiya tanımını güncelleyin. Tanımı değiştirmek eski kayıtları değiştirmez.

**Aynı kişi aynı gün iki bölüme destek verdiyse ne yapılır?**
V1.3 kuralı buna izin vermez; tek kayıtta en çok destek verilen bölüm seçilir ve not yazılır. Bu ihtiyaç sık doğarsa kural "aynı kişi + aynı alan bölüm + aynı gün" olarak gevşetilebilir.

---

## V1.2 · 12 Kasım 2026

> V1.3'te talep kanalı ve talep eden alanları kaldırıldı; aşağıdaki V1.2 notlarında geçen bu alanlar artık kullanılmıyor.

V1.2'nin amacı, desteğin işleyişine uymak. Talep WhatsApp'tan gelir; kayıt aynı gün, ertesi gün veya ertesi hafta girilir. Testler 40 ve hepsi geçiyor. Veritabanı V1.1 ile uyumlu: yeni `shifts` tablosu açılışta kendiliğinden oluşur.

### Geriye dönük giriş

| Ayar (Parametreler) | Varsayılan | Anlamı |
|---|---|---|
| Geriye dönük giriş | 7 gün | Desteğin başladığı gün bugünden en fazla bu kadar geride olabilir. V1.1'deki 12 saatlik toleransın yerini aldı. |
| Haftalık kapanış | Kapalı | Açılırsa seçilen gün ve saatte (ör. pazartesi 12:00) önceki haftalar kilitlenir. |

Kilitli tarihe giriş, düzenleme veya geri çekme için yöneticinin "Dönem yönetimi"nden pencere açması gerekir. İki kural birlikteyse daha kısıtlayıcı olan geçerlidir. Kodda: `entryFloor()`, `periodOpen()`.

### Talep kanalı ve talep eden

Her kayıtta isteğe bağlı iki alan var:

- **Talep kanalı:** WhatsApp, telefon, yüz yüze, e-posta, diğer
- **Talep eden:** serbest metin

Talep programın dışında kalsa da izi kayıtta durur; dashboard ve raporlar kanala göre dağılımı gösterir.

### Toplu giriş

"Destek kayıtları" ekranındaki **Toplu giriş** düğmesiyle açılır.

- Üstte ortak bilgiler girilir: veren ve alan bölüm, talep kanalı, talep eden, kayıt türü, açıklama.
- Her satır bir kişidir: tarih, vardiya, başlangıç, bitiş, mola, personel. Vardiya seçilince saatler dolar; bitiş başlangıçtan küçükse ertesi gün sayılır.
- Aynı tarih, saat, mola ve vardiyadaki satırlar **tek destek kaydında** birleşir.
- **Son günü bu tarihe kopyala:** Bölümün en son destek gününü seçilen tarihe kopyalar.
- **Excel'den doldur:** Şablondaki sütunlar Tarih, Sicil, Vardiya, Başlangıç, Bitiş, Mola (dk). Satırlar ekrana gelir, kontrol edilip gönderilir.
- **Hepsi ya da hiçbiri:** Kayıtlar önce bir kopya üzerinde denenir. Tek satırda hata varsa hiçbir kayıt açılmaz; hatalar satır numarasıyla gösterilir. Bir seferde en fazla 300 kayıt açılır.

Kodda: `app/bulk.tsx`, `applyAction` → `supportBatch`, `buildSupportRows()`.

### Vardiya

- **Tanım:** Tanımlar → Vardiyalar. Kod, ad, başlangıç ve bitiş saati, isteğe bağlı lokasyon. Hazır olarak Sabah 08–16, Akşam 16–00 ve Gece 00–08 gelir; değiştirilebilir.
- **Kayıtta:** Vardiya seçilince saatler dolar, istenirse değiştirilir. Kayıt, desteğin başladığı güne aittir.
- **Puantajda:** Puantaj dosyasında isteğe bağlı "Vardiya" sütunu okunur (kod veya ad).
- **Uyumsuzluk:** Kişi puantajda başka vardiyadaysa uyumsuz destek olarak görünür (tür: farklı vardiya).
- **Filtre:** Destek kayıtları, dashboard ve rapor merkezinde vardiya filtresi vardır.

Kodda: `s.shifts`, `definition` → `shifts`, `issues()` → `shift`.

### Dashboard'a eklenenler

Hepsi kayıt ve kişi sayısıyla çalışır; saat hesabı yoktur.

| Görsel | Ne gösterir |
|---|---|
| Takvim · gün ve bölüm | Her bölümün gün gün aldığı veya verdiği kayıt sayısı; renk koyulaştıkça artar, çizgi haftanın başıdır |
| Vardiyaya göre | Vardiya başına kayıt ve kesinleşen sayısı |
| Talep kanalı | WhatsApp, telefon vb. dağılımı |
| Giriş gecikmesi | Destek gününden kaydın girilmesine kaç gün geçtiği (aynı gün, ertesi gün, 2–3, 4–7, 8+); 4 gün ve üzeri bölüm bazında |
| Onay süresi | Onaya gönderimden karara ortalama saat, bölüm bazında; sistem onayı sayısı |
| En çok destek veren personel | İlk 10 kişi, gün sayısı ve destek verdiği bölümler |

Kodda: `analytics()` (`lib/dashboard.mjs`).

### Rapor merkezi

Raporlar ekranı yenilendi. Filtreler: tarih (son 7 gün, son 30 gün, bu ay), lokasyon, bölüm, vardiya.

| Rapor | İçerik |
|---|---|
| Dönem özeti | Göstergeler, güne göre, vardiyaya göre, talep kanalına göre |
| Bölüm raporu | Verilen/alınan, veren–alan matrisi, bölüme göre uyumsuz |
| Uyumsuz destek raporu | Türe göre sayılar ve kayıt kayıt liste (durum, not) |
| Personel raporu | Kişi başına kayıt, gün, destek verdiği bölümler, uyumsuz kayıt |
| Giriş gecikmesi ve onay süresi | Gecikme dağılımı, bölüme göre gecikme ve onay süresi |
| Destek kayıt listesi | Tüm alanlarıyla kayıtlar |

**Çıktılar:**

- Seçilen rapor ekranda önizlenir.
- **Excel:** Her bölüm ayrı sayfa.
- **Yazdır / PDF:** Tarayıcının yazdır penceresi açılır; "PDF olarak kaydet" seçilebilir. A4 yatay, her rapor yeni sayfada.
- **Tümü tek Excel / Tümünü yazdır:** Altı rapor birlikte.

Kodda: `lib/reports.mjs` (`buildReport`, `buildAll`), `app/report-center.tsx`.

### V1.2'de yapılmayanlar

- **Haftalık özetin otomatik e-postayla gönderimi:** E-posta altyapısı şu an yalnızca Microsoft 365 (Graph) ile çalışıyor ve kayıt bazlı bildirim için kurulu. Rapor e-postası V2'de, SMTP ile birlikte önerilir.
- **Bölümler arası akış diyagramı:** Dashboard'daki veren–alan matrisi aynı bilgiyi veriyor.

### V1.2 için sık sorulabilecek sorular

**Giriş gecikmesi nasıl hesaplanır?**
Desteğin başladığı gün ile kaydın sisteme ilk girildiği gün (Türkiye saati) arasındaki gün farkıdır. Planlanan kayıtlar hariçtir; düzenleme gecikmeyi değiştirmez.

**Onay süresi nasıl hesaplanır?**
Kaydın onaya gönderildiği an ile karar anı arasındaki saattir. Düzenlenen kayıtta süre son gönderimden başlar. Sistem (otomatik) onayları ortalamaya katılmaz, ayrıca sayılır.

**Bir kayıt neden "Bu tarih için giriş kapalı" hatası veriyor?**
Ya desteğin günü geriye dönük giriş süresinden eski, ya da haftalık kapanış o haftayı kilitlemiştir. Yönetici "Dönem yönetimi"nden ilgili tarih için pencere açar.

---

# V1.1 · 11 Kasım 2026

11 Kasım 2026. V1 incelemesinde bulunan hatalar düzeltildi, Excel içe aktarma yeniden yazıldı, kurulum profili ve otomatik yedek eklendi. Veritabanı yapısı değişmedi: V1 `veri/destek.sqlite` dosyası V1.1 ile doğrudan açılır. Testler 37 (adam-saat ve verimlilik testleri kaldırıldı) ve hepsi geçiyor.

## Kodun haritası

| Dosya | Ne yapar |
|---|---|
| `lib/domain.mjs` | Bütün iş kuralları. Her değişiklik `applyAction(durum, kullanıcı, işlem, veri)` üzerinden geçer: `support`, `decision`, `resolve`, `window`, `settings`, `definition`, `import`, `rules`. |
| `lib/dashboard.mjs` | Dashboard hesapları (dönemler, kayıt ve kişi sayıları, destek matrisi, uyumsuz destek özeti) ve `analytics()` (takvim, vardiya, kanal, gecikme, onay süresi, personel). |
| `lib/reports.mjs` | **V1.2.** Rapor merkezi raporları. |
| `app/bulk.tsx` | **V1.2.** Toplu destek girişi ekranı. |
| `app/report-center.tsx` | **V1.2.** Rapor merkezi ekranı, Excel ve yazdırma. |
| `app/dashboard.tsx` | **Yeni.** Dashboard ekranı. |
| `lib/import.mjs` | **Yeni.** Excel satırlarını sunucunun beklediği biçime çevirir (tarih, saat, durum kodu, sütun eşleştirme). |
| `server/main.mjs` | HTTP sunucusu, oturum, giriş sınırı, parola değiştirme, kurulum profili. |
| `server/store.mjs` | SQLite okuma/yazma ve yedek alma (`backup`). |
| `server/backup.mjs` | **Yeni.** Günlük otomatik yedek. |
| `server/mail.mjs` | Microsoft 365 e-posta kuyruğu (değişmedi). |
| `server/access-view.mjs` | Access istemcisine düz metin yanıt (karar yetkisi artık çekirdekten geliyor). |
| `app/ui.tsx` | Tarayıcı arayüzü. |
| `tests/v11.test.mjs` | **Yeni.** V1.1 düzeltmelerinin testleri; test adları aşağıdaki numaralarla eşleşir. |

## Düzeltilen iş kuralı hataları

| # | V1'de ne oluyordu | V1.1'de ne oluyor | Kodda nerede |
|---|---|---|---|
| 1 | Gelecek tarihli destek "gerçekleşen" olarak onaylanıp kesinleşiyordu. | Bitişi henüz gelmemiş kayıt yalnızca "planlanan" olabilir. | `applyAction` → `support`: `!p.realized \|\| end <= now` |
| 2 | 22:00–06:00 gece desteği ertesi sabah girilemiyordu. | V1.1'de 12 saatlik tolerans eklendi; V1.2'de yerini gün bazlı geriye dönük giriş süresi aldı (varsayılan 7 gün). | `entryFloor()`, `periodOpen()` |
| 3 | Herhangi bir puantaj aktarımı tüm kayıtların inceleme notlarını siliyordu. | Yalnızca puantajı değişen kişi-güne ait kayıtlar yeniden incelemeye düşer; eski not `issueHistory` içinde saklanır. | `applyAction` → `import`, son blok |
| 4 | Başkasının kaydını düzenleyen kişi onu onaylayabiliyordu. | Kaydı oluşturan **ve** son düzenleyip gönderen (`submittedBy`) karar veremez. | `isAuthor()`, `canDecide()` |
| 5 | Onaylı kayıt düzenlenince eski karar kayboluyordu. | Her düzenlemede önceki sürüm, kararıyla birlikte `history` dizisine eklenir; ayrıntı ekranında "Kayıt geçmişi" görünür. İşlem geçmişine değişen alanlar yazılır. | `applyAction` → `support`, `changedFields()` |
| 6 | Personelin bölüm değişikliğinin tarihi tutulmuyordu. | Bölüm değişikliği bir tarihten itibaren geçerli olur; önceki bölüm `deptHistory` içinde saklanır. | `deptOn()`, `definition` → `people` |
| 8 | Yeni bölümün kimliği rastgele uzun bir koddu. | Bölüm ve lokasyon açılırken kısa kod girilir (ör. `PAK`). | `definition` |
| 9 | Parametreler tip kontrolsüz kaydediliyordu (`"false"` metni açık sayılıyordu). | Her alan tek tek doğrulanır, bilinmeyen alanlar atılır. | `applyAction` → `settings` |

Ek düzeltmeler:

- **Tanım alanları:** Her tanım türü yalnızca kendi alanlarını saklar (bölüm kaydına kullanıcı rolü yazılması gibi karışıklıklar önlendi).
- **İşlem geçmişi:** Olaylar kullanıcı kimliğiyle kaydedilir. Aynı adı taşıyan iki kullanıcı birbirinin geçmişini görmez.
- **Kayıt kodu:** Toplam kayıt sayısından değil, en büyük mevcut numaradan üretilir.
- **Örnek veri:** Bitişi gelmemiş örnek destekler "planlanan" olarak oluşur.

## Excel içe aktarma

Kurumun kendi puantaj çıktısı doğrudan yüklenebilir.

1. **Okuma:** Tarih ve saat hücreleri Excel seri sayısı olarak okunur (saat dilimi kayması olmaz). Metin tarihler de kabul edilir: `2026-11-04`, `04.11.2026`, `4/11/26`.
2. **Sütun eşleştirme:** "Sicil No", "Puantaj Kodu", "Giriş" gibi başlıklar otomatik tanınır. Tanınmayanlar ekranda seçilir.
3. **Puantaj kodları:** Dosyadaki her farklı kod listelenir. Kodun anlamı seçilir: *İşe geldi*, *İşte değil (devamsızlık, izin, rapor, tatil)* ya da *Satırı alma*. "Geldi", "İzinli", "Raporlu", "HT" gibi kodlar otomatik tahmin edilir.
4. **Gece vardiyası:** Çıkış saati girişten küçükse (22:00 → 06:00) çıkış ertesi güne yazılır.
5. **Saat yazımı:** Giriş/çıkış `07:30`, `07;30`, `07.30` veya Excel saat hücresi olabilir.
6. **Çalışma süresi (isteğe bağlı sütun):** Kişinin o gün fiilen çalıştığı süre. Şu yazımlar kabul edilir:
    - `03:30` veya `03;30` → 3 saat 30 dakika
    - `7,5` veya `7.5` → 7,5 saat (ondalık)
    - Excel süre hücresi

    Giriş–çıkış da varsa süre bu aralıktan uzun olamaz.
7. **Kontrol:** Hatalı satırlar Excel satır numarasıyla listelenir. Sunucu da bütün satırları denetler; tek bir hata varsa **hiçbir kayıt değişmez**.
8. **Sınır:** Dosya başına 10.000 satır (V1'de 2.000).

Şablonlar artık .xlsx ve Türkçe başlıklı.

## Çalışma süresi kontrolü

Puantajda çalışma süresi varsa, kişinin o gün başlayan reddedilmemiş desteklerinin net süreleri toplanır. Toplam bu süreyi aşarsa ilgili her destek kaydı uyuşmazlık olarak işaretlenir.

> Örnek: Puantajda 03:30 çalışan kişiye aynı gün 3:45 + 3:45 = 7:30 destek girildi. Kontrol listesinde "Günlük destek süresi (7:30 sa) puantajdaki çalışma süresini (3:30 sa) aşıyor" görünür.

Bu uyuşmazlık da diğerleri gibi işler: inceleme bekler, otomatik onayı bekletir, parametreye göre girişi engeller veya hesap dışında tutulur. Kodda `issues()` → `exceeds`.

## Adam-saat ve verimlilik kaldırıldı

İsteğe göre program saat bazlı işgücü hesabı yapmaz. Kaldırılanlar:

- Adam-saat ve verimlilik hesapları
- İşlem adedi aktarımı
- Raporlardaki işgücü dengesi ve verimlilik tabloları
- `lib/reporting.mjs` dosyası

Yerine **kayıt ve kişi sayıları** gösterilir. **Kesinleşen destek**, onaylı ve gerçekleşen destek kaydıdır.

Puantaj kalır; yalnızca uyumsuz destek kontrolünde kullanılır. Kontrol, kişinin günlük destek süresini puantajdaki çalışma süresiyle karşılaştırmayı da kapsar.

Eski veritabanındaki işlem adedi satırları silinmez, yalnızca kullanılmaz.

## Dashboard

Menüdeki **Dashboard** ekranı destek kayıtlarını sayılarla izler.

**Filtreler:** başlangıç ve bitiş tarihi, gruplama (gün, hafta, ay veya otomatik), lokasyon, bölüm. Hızlı seçim düğmeleri: son 7 gün, son 4 hafta, son 3 ay.

**Ekranın bölümleri:**

| Bölüm | Ne gösterir |
|---|---|
| Göstergeler | Kesinleşen destek kaydı, destek veren kişi sayısı, onay bekleyen ve planlanan kayıt, ret oranı, geri çekilen/iptal sayısı |
| Destek kayıtları grafiği | Döneme göre kesinleşen (koyu) ve onay bekleyen (açık) kayıt sayısı; üzerine gelince planlanan, reddedilen, iptal ve kişi sayısı |
| Kim kime destek verdi? | Veren × alan bölüm matrisi (kesinleşen kayıt sayısı); renk koyulaştıkça sayı artar |
| Bölüm bazında destek | Verilen ve alınan kesinleşen kayıt, destek veren kişi, bekleyen, reddedilen, iptal |
| Uyumsuz destek (isteğe bağlı) | "Uyumsuz destekleri göster" işaretlenirse açılır; tercih tarayıcıda hatırlanır |

**Excel'e aktar** tek dosyada ayrı sayfalar üretir: Özet, Dönemler, Bölümler, Destek matrisi ve (açıksa) Uyumsuz destek.

**Yetki:** Bölüm yetkilisi yalnızca kendi bölümlerini, yönetici ve rapor izleyicisi tümünü görür.

**Örnek veri:** "Örnek verilerle dene" seçilince son 4 haftanın sentetik puantajı ve destekleri de oluşur; grafikler boş görünmez.

Hesaplar `lib/dashboard.mjs` içindeki `dashboard()` fonksiyonundadır. Ekrandan bağımsız olduğu için ileride MCP aracı ("bu hafta Toplama'ya kaç destek verildi") aynı fonksiyonu çağırabilir.

## Uyumsuz destekler ve geri çekme

**Uyumsuz destek** puantajla çelişen destek kaydıdır. Üç durumda oluşur:

- Kişi o gün işe gelmemiş (gelmedi, izinli, raporlu, tatil)
- Destek saatleri puantajdaki giriş–çıkış aralığının dışında
- Kişinin günlük destek toplamı puantajdaki çalışma süresini aşıyor

Puantaj satırının hiç olmaması uyumsuzluk sayılmaz; veri uyarısıdır. Kodda: `mismatches()`.

**Uyumsuz destekler ekranı** (menüde turuncu sayaçla) üç sekmeden oluşur:

- **Açık:** İncelenmemiş uyumsuzluklar
- **İncelendi, devam ediyor:** Açıklama yazılıp geçerli kabul edilenler
- **İptal edilen:** Uyumsuzluk nedeniyle iptal edilenler

Her satırda **İncele** (karşı bölüm), **İptal et** (iki bölümden biri) ve **Aç** düğmeleri bulunur.

**Kayıt silinmez.** İptal edilen kaydın durumu "İptal edildi" olur. Gerekçe, iptal eden, zaman ve önceki durum saklanır. Kayıt hiçbir hesaba, çakışma kontrolüne veya süre toplamına girmez.

| İşlem | Kim yapar | Ne zaman | Gerekçe |
|---|---|---|---|
| Geri çek | Desteği veren bölümün yetkilisi veya yönetici | Kayıt bekliyor ya da onaylıyken | Onaylı kayıtta zorunlu |
| Uyumsuzluk nedeniyle iptal | İki bölümden birinin yetkilisi veya yönetici | Kayıtta uyumsuzluk varken | Zorunlu |
| Düzenle ve yeniden gönder | Desteği veren bölüm | Geri çekilmiş, iptal edilmiş veya reddedilmiş kayıtta | — |

Dönem kapalıysa yalnızca yönetici geri çekebilir. Yeniden gönderilen kayıt onay beklemeye düşer; iptal edilmiş sürüm, gerekçesiyle birlikte "Kayıt geçmişi"nde görünür. Kodda: `applyAction` → `cancel`, `canWithdraw()`, `canCancelMismatch()`.

## Arayüz

- **Eşzamanlı değişiklik:** Başka biri arada kayıt değiştirdiyse, işlem güncel veriyle kendiliğinden bir kez daha gönderilir. Kurallar sunucuda yeniden denetlendiği için güvenlidir. V1'deki "Kayıtlar değişti" takılması bitti.
- **Rapor dışa aktarımı:** Rapor artık .xlsx olarak iner.
- **Parola değiştirme:** Üst çubuktaki **Parola** düğmesi kullanılır. Değişince diğer cihazlardaki oturumlar kapanır.
- **Parametreler:** Geç giriş toleransı alanı ve yedek durumu eklendi.

## Sunucu

- **Kurulum profili:** `ayarlar.json` içindeki `"profil"` alanı:
  - `kucuk`: 1–10 kullanıcı. HTTPS olmadan ağa açılabilir ama o durumda yalnız uygulamanın kurulu olduğu bilgisayardan giriş yapılır; başka cihazdan gelen API istekleri `HTTPS_REQUIRED` iletisiyle reddedilir (`plainRemote`, bu bilgisayarın kendi adresleri `os.networkInterfaces` ile tanınır). Başka cihaz için HTTPS: `tls.pfx` (Windows'ta dışa aktarılan sertifika) ya da `tls.key` + `tls.cert`. 14 yedek saklanır. Test: `tests/https.test.mjs`.
  - `orta`: Ağa açarken HTTPS zorunlu, 30 yedek.
  - `kurumsal`: HTTPS ve Microsoft 365, 90 yedek.
- **Otomatik yedek:** Her gün saat 02.00'den sonra `yedek/destek-YYYY-AA-GG.sqlite` oluşur. Sunucu çalışırken alınır. Geri dönmek için sunucuyu durdur, yedeği `veri/destek.sqlite` adıyla kopyala, sunucuyu başlat.
- **Giriş güvenliği:** Aynı hesaba 15 dakikada 5 hatalı denemeden sonra hesap 15 dakika kilitlenir. Bu, kurum proxy'si arkasında herkesin birlikte kilitlenmesini önler; IP sınırı 30 denemeye çıkarıldı.

## Bilinen açıklar ve sonraki adımlar

- **`xlsx` paketi:** Sürüm 0.18.5'te bilinen iki açık var; düzeltilmiş sürüm npm'de değil, SheetJS'in kendi sunucusunda. İnternete açık bir bilgisayarda proje klasöründe şu komutu çalıştır, sonra `npm run build` ve `npm test`:
  `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- **Access istemcisi:** Donduruldu. Sunucuyla uyumlu kalıyor ama yeni özellik eklenmiyor.
- **V2'ye kalanlar:**
  - İlişkisel tablolar ve kayıt bazında kilit
  - Sunucu tarafında rapor hesabı ve sayfalama
  - Vardiya tanımı
  - Adetle talep ve kişi bazında saat
  - SMTP e-posta
  - Windows servisi kurulumu

## Sık sorulabilecek sorular

**Bir destek kaydı ne zaman kesinleşir?**
Onaylı **ve** gerçekleşen olduğunda (`counted()`). "Çözümlenmemiş uyumsuzlukları kesinleşen saymama" açıksa puantaj uyumsuzluğu da çözülmüş olmalıdır.

**Otomatik onay nasıl çalışır?**
Sunucu dakikada bir `runRules()` çalıştırır. Onaya gönderimden itibaren ayarlanan gün dolduysa bekleyen kayıt "Sistem" onayı alır. Kayıt düzenlenirse süre baştan başlar.

**Neden bütün kurallar sunucuda?**
Tarayıcıdaki kısıtlar atlatılabilir. Tarayıcı aynı `domain.mjs` dosyasını yalnızca önizleme için kullanır; asıl karar sunucudadır.

**Testleri nasıl çalıştırırım?**
`npm test`. Her iş kuralı için en az bir test vardır; bir kuralı değiştirince önce ilgili testi güncelle.

## Onay kartında bekleme, sorumlu ve saate etkisi (19 Kasım 2026)
- **Ne var?** Onay kutusundaki her kartta üç kutu: **Ne zamandır bekliyor** (`submittedAt`'ten bu yana saat/gün ve gönderilme zamanı), **Kimden işlem bekleniyor** (destek alan bölüm; kart yalnız karar verebilen kullanıcıya göründüğü için "senden"), **Toplam saate etkisi** (`netHours(r) × kişi sayısı`; uyumsuzluk varsa `excludeIssues` ayarına göre "sayılmaz" ya da "uyumsuzluğa rağmen sayılır", planlanan kayıtta "gerçekleşince sayılır").
- **Kod:** `app/ui.tsx` onay kartı (`approval-facts`), stil `app/globals.css`. Hesap kuralı `lib/domain.mjs` → `counted` ile aynıdır; kural değişirse karttaki metin de değişmeli. İngilizce karşılıklar `lib/i18n/en.json`.

## Windows'ta AgaAc.cmd denemesi (24 Kasım 2026, 1.7.2 hazır paket)

Gerçek bir Windows 11 bilgisayarda, yönetici olmadan çalıştırıldı:

- Paket SHA256 sürüm sayfasıyla aynı. **AgaAc.cmd** tek ağ adresini (192.168.1.x) kendisi buldu, soru sormadı. `veri\sertifika.pfx` ve `veri\sertifika.cer` üretildi; **ayarlar.json** güncellendi (host 0.0.0.0, port 8732, baseUrl https://<ip>:8732, tls alanı), eskisi **ayarlar.json.yedek** oldu. Yönetici olmadığı için güvenlik duvarı kuralı eklenmedi (beklenen).
- **Baslat.cmd** sunucuyu açtı; https://<ip>:8732 isteği 200 ve "Destek Merkezi" sayfası döndü.
- Sertifika doğrulamalı istek "Sertifika yetkilisi geçersiz" hatası verdi: sertifika güvenilen köklere eklenmediği için tarayıcı ilk girişte uyarı gösterir. KURULUM.md bunu anlatıyor (`sertifika.cer` cihazlara "Güvenilen kök" olarak yüklenir).

**Yapıldı (24 Kasım 2026):** AgaAc sonunda isteğe bağlı olarak sertifikayı bu Windows kullanıcısının güvenilen köklerine ekliyor (`-Guven` / `-Guvenme`, varsayılan soru ve "Hayır"). Neden varsayılan Hayır: kök deposuna eklemek güven kararıdır, kullanıcı bilerek seçmeli. Neden CurrentUser: yönetici gerekmez, yalnız o hesabı etkiler. Betik PowerShell 7 ayrıştırıcısıyla hatasız; kök ekleme adımı kullanıcının makinesinde onayla denenmeli (bir test daha).
