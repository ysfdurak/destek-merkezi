# Destek Merkezi · Windows

> Docker ve VPS (Linux sunucu) kurulumu için: [docs/SUNUCU_KURULUMU.md](docs/SUNUCU_KURULUMU.md)

## İlk açılış

1. **Hazır paket (önerilen):** GitHub Sürümler sayfasındaki `destek-merkezi-<sürüm>-windows-x64.zip` dosyasını yazılabilir bir klasöre ayıkla (indirdikten sonra sağ tık › Özellikler › Engellemeyi kaldır). Node.js kurmak gerekmez: paketteki `runtime\node\node.exe` kullanılır, arayüz derlenmiş gelir. **Kaynak koddan:** kaynak paketi yazılabilir bir klasöre ayıkla ve Node.js 24 kur.
2. Windows’ta **Baslat.cmd** dosyasını aç. Hazır pakette sunucu doğrudan açılır. Kaynak koddan ilk açılışta **npm ci** ve **npm run build** kendiliğinden çalışır (internet gerekir, bir kez yapılır). PowerShell'den açıyorsan `.\Baslat.cmd` yaz. Komut satırından başlatmak için **ayarlar.ornek.json** dosyasını **ayarlar.json** olarak kopyala ve **npm start** çalıştır. Tarayıcı otomatik açılmazsa **http://127.0.0.1:8732** adresine git.
3. Yönetici hesabı için ad, e-posta adresi ve en az 12 karakterli parola belirle. Örnek verilerle denemeyi veya boş çalışma alanı oluşturmayı seç.
4. Örnek alanda üstteki kullanıcı seçimiyle onay ve ret akışını dene. Boş alanda **Tanımlar ve kullanıcılar** ekranından lokasyon, en az iki bölüm, personel ve bölüm yetkilisi hesaplarını oluştur.

Sunucu Node.js 24 ile çalışır (hazır pakette Node.js içindedir). Çalışanlar kurum içi adrese tarayıcıdan bağlanır. Arayüz tarayıcıda açılır ve veritabanı **veri/destek.sqlite** dosyasında oluşur. Arka plan kuralları sunucu penceresi açıkken dakikada bir çalışır. Tarayıcıyı kapatabilirsin. Sunucuyu durdurmak için konsolda Ctrl+C kullan. Yedek almak için sunucuyu durdurup **veri** klasörünü kopyala.

Örnek ve gerçek kullanım için ayrı klasör veya **ayarlar.json** içinde ayrı **database** yolu kullan. Yerel alan ilk kurulumdaki seçimine göre başlar. Çevrimiçi sürümdeki kayıtlar pakete dahil değildir.

## Kurulum profili

**ayarlar.json** içindeki **profil** alanı işletme büyüklüğüne göre hazır ayar seçer.

| Profil | Kimin için | Ağa açma | Saklanan yedek |
|---|---|---|---|
| kucuk | 1–10 kullanıcı, tek lokasyon | Aynı bilgisayarda HTTPS'siz; başka cihazdan giriş için HTTPS | 14 gün |
| orta | Birkaç lokasyon, ofis sunucusu | HTTPS zorunlu | 30 gün |
| kurumsal | BT ekibi ve Microsoft 365 olan kurum | HTTPS zorunlu | 90 gün |

**Başka cihazdan giriş HTTPS ister.** Uygulama HTTPS olmadan ağa açılırsa yalnızca kurulu olduğu bilgisayardan giriş yapılır. Telefon veya ikinci bilgisayar giriş ekranında "bağlantı şifreli değil" uyarısını görür ve oturum açamaz. Bunun nedeni şu: HTTPS olmadan parola ve oturum bilgisi ağda açık gider, aynı ağdaki biri okuyabilir.

**Küçük işletmede yerel ağa açma (HTTPS ile), kolay yol:** Uygulama klasöründeki **AgaAc.cmd** dosyasına çift tıkla (güvenlik duvarı kuralı da eklensin istersen sağ tık › Yönetici olarak çalıştır). Betik bu bilgisayarın yerel ağ adresini bulur, iki yıllık bir sertifika üretir (veri\sertifika.pfx ve cihazlara yüklenecek veri\sertifika.cer), parolasını rastgele üretip **ayarlar.json**'a yazar, eski ayarları **ayarlar.json.yedek** olarak saklar, veri, yedek klasörleri ve ayar dosyası için okuma izinlerini daraltır ve portu yalnız yerel ağa açar. Sonunda "Bu bilgisayarın tarayıcısı sertifikaya güvensin mi?" diye sorar: **E** dersen sertifika yalnız senin Windows hesabının güvenilen köklerine eklenir (yönetici gerekmez, Windows ayrıca onay penceresi açar) ve sunucu bilgisayarındaki tarayıcı uyarı vermez; eski Destek Merkezi kayıtları kaldırılır. Sormadan yapmak için `AgaAc.cmd -Guven`, hiç sormamak için `AgaAc.cmd -Guvenme`. Sonra Baslat.cmd ile sunucuyu yeniden başlat. IP adresi değişirse betiği yeniden çalıştır.

**Elle yapmak istersen:** Uygulamanın çalıştığı bilgisayarın yerel IP adresini öğren (ör. 192.168.1.20). Sonra uygulama klasöründe PowerShell aç ve aşağıdaki komutlarla iki yıllık bir sertifika oluştur. İlk satırdaki IP adresini kendi adresinle değiştir:

~~~powershell
$ip = "192.168.1.20"
$cert = New-SelfSignedCertificate -Subject "CN=$ip" -TextExtension @("2.5.29.17={text}IPAddress=$ip") -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(2) -KeyExportPolicy Exportable
$parola = Read-Host "Sertifika parolası" -AsSecureString
Export-PfxCertificate -Cert $cert -FilePath .\veri\sertifika.pfx -Password $parola -CryptoAlgorithmOption AES256_SHA256
Export-Certificate -Cert $cert -FilePath .\veri\sertifika.cer
~~~

**ayarlar.json** içine şunu yaz ve sunucuyu yeniden başlat (parola, yukarıda girdiğin sertifika parolasıdır):

~~~json
{ "profil": "kucuk", "host": "0.0.0.0", "port": 8732, "baseUrl": "https://192.168.1.20:8732",
  "tls": { "pfx": "veri/sertifika.pfx", "parola": "SERTIFIKA-PAROLASI" } }
~~~

Diğer cihazlar **https://192.168.1.20:8732** adresine girer. Sertifikayı bu bilgisayar kendisi imzaladığı için tarayıcı ilk girişte "bağlantı gizli değil" uyarısı verir. Uyarıyı kaldırmak için **veri/sertifika.cer** dosyasını her cihaza "Güvenilen kök sertifika yetkilileri" olarak yükle. Bu, bağlantının bu bilgisayara gittiğini doğrular. Yüklemeden devam edilirse bağlantı yine şifreli olur ama aradaki birinin araya girmesine karşı koruma zayıflar. Kurumda BT ekibi varsa kurumun kendi sertifikasını kullanmak daha iyidir (aşağıda). **ayarlar.json** artık sertifika parolasını içerdiği için klasörü yalnız yöneticiler görebilmeli. Windows Güvenlik Duvarı 8732 portuna izin isteyebilir.

PEM biçiminde anahtar ve sertifikan varsa **tls** alanında **pfx** yerine **key** ve **cert** yollarını yazabilirsin.

## Otomatik yedek

Sunucu çalışırken her gün saat 02.00'den sonra **yedek** klasörüne **destek-YYYY-AA-GG.sqlite** dosyası yazılır. Profil kadar yedek saklanır, eskiler silinir. Yedek durumu Parametreler ekranında görünür.

~~~json
"yedek": { "acik": true, "klasor": "yedek", "saat": 2, "saklanacak": 30 }
~~~

Yedekten dönmek için:

1. Sunucuyu durdur.
2. Mevcut **veri/destek.sqlite** dosyasını kenara al.
3. İstediğin yedeği **veri/destek.sqlite** adıyla kopyala.
4. Sunucuyu başlat.

Yedek klasörünü ayrıca başka bir diske veya ağ klasörüne kopyalamak önerilir.

## Şirket ağına açma (orta ve kurumsal profil)

Bilgisayarın başında varsayılan ayarla ilk kurulumu tamamla. Sonra BT ekibi sunucuya kurum DNS adı ve istemcilerin güvendiği TLS sertifikasını tanımlayabilir. **ayarlar.json** içinde aşağıdaki alanları mevcut ayarlarla birleştir.

~~~json
{
  "host": "0.0.0.0",
  "port": 8732,
  "baseUrl": "https://destek.kurum.example:8732",
  "database": "veri/destek.sqlite",
  "tls": {
    "key": "sertifika/sunucu-key.pem",
    "cert": "sertifika/sunucu-chain.pem"
  }
}
~~~

BT ekibi portu kurum ağına sınırlandırıp uygulamayı açılışta otomatik çalışan bir görev veya kurumun servis altyapısında çalıştırabilir. Kullanıcılar aynı HTTPS adresine kendi hesaplarıyla bağlanır. Varsayılan ayar erişimi uygulamanın çalıştığı bilgisayarla sınırlar.

## Microsoft 365 e-posta bağlantısı

Gönderim varsayılan olarak kapalıdır. Son gün hatırlatması Parametreler ekranında taslak görünür. Onay süresi ve hatırlatma eşiği ekrandan değiştirilebilir.

1. BT ekibi Microsoft Entra’da bir uygulama ve gönderen olarak kullanılacak Exchange Online posta kutusunu belirler. Exchange Online Application RBAC ile **Application Mail.Send** rolünü o posta kutusuna sınırlandırır. Kurum genelinde ayrıca verilmiş kapsam dışı bir Mail.Send yetkisi varsa izinler birleşebilir. BT ekibi erişim kapsamını kontrol eder.
2. **ayarlar.json** dosyasındaki **mail** alanını günceller. **sender** için posta kutusunun kullanıcı oturum adını (UPN) kullanır.

~~~json
{
  "mode": "test",
  "tenantId": "kurum-tenant-kimligi",
  "clientId": "uygulama-istemci-kimligi",
  "sender": "destek@kurum.example",
  "testRecipient": "bt-test@kurum.example",
  "allowedRecipientDomains": ["kurum.example"]
}
~~~

3. Uygulama gizli anahtarını çalıştıran sürecin **DESTEK_GRAPH_SECRET** ortam değişkenine ver. Bir kerelik yerel deneme için PowerShell’i paket klasöründe açıp aşağıdaki komutları çalıştırabilirsin.

~~~powershell
$graphSecretInput = Read-Host "Graph istemci anahtari" -AsSecureString
$graphSecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($graphSecretInput)
try {
    $env:DESTEK_GRAPH_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($graphSecretPointer)
    node .\server\main.mjs --open
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($graphSecretPointer)
    Remove-Item Env:DESTEK_GRAPH_SECRET -ErrorAction SilentlyContinue
}
~~~

4. **Parametreler → Test e-postası gönder** ile tek bir deneme iletisi gönder. Test modu, tanımlı test adresine personel veya puantaj verisi içermeyen sabit metni gönderir. Hatırlatmalar taslak kalır.
5. BT ekibi test iletisini doğruladıktan sonra HTTPS çalışma adresi, gönderen ve izinli alıcı alan adları tanımlıyken **mode** değerini **live** yapabilir. Sunucuyu yeniden başlat. Canlı hatırlatmalar boş çalışma alanında tanımladığın aktif karşı bölüm yetkililerine gider.

Her bekleyen destek kaydı için onaya gönderim turu başına bir hatırlatma hazırlanır. Kayıt hâlâ bekliyorsa ve son onay süresi dolmadıysa e-posta kuyruğu güncel bölüm yetkilerini kontrol eder. İçerikte destek kayıt kodu, son onay zamanı ve kurum içi onay kutusu bağlantısı yer alır. Microsoft’un isteği kabul etmesi ekranda **Gönderime kabul edildi** olarak görünür. Teslim durumunu posta kutusundan veya Exchange mesaj izlemesinden kontrol et. Gönderim sonucu belirsizse Gönderilmiş Öğeler’i incele. Microsoft hız sınırına ulaşıldığında uygun süre içinde yeniden denenir.

Gönderim için sunucudan **login.microsoftonline.com** ve **graph.microsoft.com** adreslerine HTTPS erişimi gerekir. Bu sürüm Microsoft 365 Graph ile çalışır. Kurumda yalnızca SMTP relay kullanılabiliyorsa sağlayıcı uyarlaması gerekir.

[Microsoft Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail) · [Exchange Online uygulama yetkilerini kapsamlandırma](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac)

## Kaynak kod

**app** ve **lib** arayüzü ve iş kurallarını, **server** yerel sunucuyu ve posta kuyruğunu içerir. Önceden derlenmiş dosyalar **public** klasöründedir. Geliştirmek için Node.js 24 ile **npm ci**, **npm run build** ve **npm test** komutlarını çalıştırabilirsin.

## Hazır paket nasıl üretilir

`.github/workflows/windows-paket.yml` her gönderimde gerçek bir Windows makinesinde `npm ci`, `npm run build` ve **paket\paketle.ps1** çalıştırır. Betik resmî Node.js Windows zip'ini (nodejs.org, sürümü betikte sabit) indirir, SHA-256 değerini betikteki değerle karşılaştırır, tutmazsa durur. Pakete yalnız **node.exe** ve Node.js lisansı, derlenmiş **public**, **server**, **lib**, **access**, belgeler ve betikler girer; **node_modules**, **veri**, **yedek**, **ayarlar.json** ve Access dosyaları girmez. Sonra zip açılır, PATH'te Node.js yokken **Baslat.cmd** başlatılır ve sunucunun `/healthz`, `/`, `/app.js`, `/api/startup` için HTTP 200 verdiği, paketteki node.exe ile çalıştığı denetlenir. `v*` etiketi gönderildiğinde ya da sürüm yayımlandığında zip ve `.sha256` Sürümler sayfasına eklenir; etiket `package.json` sürümüyle aynı olmalıdır.

Elle üretmek için (Windows, depo kökünde): `npm ci`, `npm run build`, `pwsh -File paket\paketle.ps1` → **dist** klasörü. Node.js sürümünü yükseltirken betikteki sürüm ve SHA-256 satırını birlikte değiştir (değer `https://nodejs.org/dist/v<sürüm>/SHASUMS256.txt` içindeki `win-x64.zip` satırıdır).
