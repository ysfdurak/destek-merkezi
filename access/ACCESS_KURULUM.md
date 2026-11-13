# Destek Merkezi · Microsoft Access sürümü

> **V1.1 notu:** Access istemcisi donduruldu. V1.1 sunucusuyla uyumlu çalışır ve aynı kurallara tabidir (ör. kaydı son düzenleyen onaylayamaz, bitişi gelmemiş destek "gerçekleşen" girilemez). Yeni özellikler (Excel eşleştirme, kayıt geçmişi, parola değiştirme) yalnızca tarayıcı arayüzündedir. Küçük işletmeler için önerilen yol, sunucuyu **kucuk** profiliyle çalıştırıp diğer bilgisayarlardan tarayıcıyla bağlanmaktır.

Access masaüstü formu ve tarayıcı yönetim portalı aynı yerel sunucuya bağlanır. Access dosyası parola, oturum veya destek kaydı tablosu tutmaz. Hesaplar ve kayıtlar sunucunun SQLite veritabanındadır.

## İlk deneme

1. Bu paketi Windows bilgisayarda ayıkla. Sunucu için ayrı verilen **Destek_Merkezi_Web_Sunucu.zip** paketini kullan ve içindeki **README.md** kurulum adımlarını uygula. Kurumda hazır bir sunucu varsa doğrudan onun adresini kullanabilirsin. Access formunu ilk kez oluşturmak için tam **Microsoft Access masaüstü** sürümü gerekir.
2. Sunucu paketinden **Baslat.cmd** ile sunucuyu aç veya kurumun açık sunucusuna bağlan. Yönetim portalında ilk yönetici hesabını oluştur ve örnek verili veya boş alanı seç. **Tanımlar ve kullanıcılar → Kullanıcılar** üzerinden bölüm yetkililerine parola tanımla. Örnek hesaplara da ilk kez parola belirlenir.
3. **access/Baslat_Access.cmd** dosyasını aç. İlk çalıştırma aynı klasörde **Destek_Merkezi.accdb** dosyasını oluşturur. Sonraki çalıştırmalarda bu dosyayı açar.
4. Access ekranında yönetim portalında tanımladığın e-posta ve parolayla giriş yap. **Yeni destek** ile talep aç. Karşı bölüm hesabında **Onay kutusu** üzerinden onayla veya gerekçe yazarak reddet.

Access formu oluşturma, PowerShell ve VBA çalıştırma izinlerine tabidir. Kurumsal cihazlarda BT ekibi onaylı klasör ve kod çalıştırma politikasını uygular. Dosya oluşturucu Access Runtime üzerinde denenmedi.

## Birden fazla kullanıcı

Sunucu bir Windows makinede çalışır. Sunucu paketindeki **KURULUM.md** dosyasındaki kurum ağı adımlarıyla HTTPS adresini tanımla. Her kullanıcıya Access klasörünün yerel kopyasını ver ve **Sunucu_Adresi.ornek.txt** dosyasını **Sunucu_Adresi.txt** olarak kopyala ve içine aynı HTTPS adresini yaz. Adres yalnızca protokol, sunucu adı ve varsa port içermelidir. Yerel deneme adresi http://127.0.0.1:8732 olur. Bu adres başka bilgisayardaki sunucuya bağlanmak için kullanılmaz.

Access içinde giriş, kayıt listeleme, destek talebi, onay kutusu, onay ve gerekçeli ret vardır. **Yönetim portalı** düğmesi kullanıcı yönetimi, puantaj ve Excel aktarımı, geçmiş dönem izinleri, raporlar, posta kuyruğu ve e-posta testi için tarayıcıyı açar. Tarayıcıda aynı hesabınla ayrı oturum açılır. Graph hatırlatmaları sunucuda çalışır. Kurumsal posta kutusu yetkisi ve e-posta ayarları sunucu paketindeki **KURULUM.md** içindedir.

## Sürüm ve geçiş

Access istemcisi için uyumlu Destek Merkezi sunucusunun çalışması gerekir. Yerel denemede adres 127.0.0.1:8732 olur. Kurum içi kullanımda Access klasöründeki adres dosyasında merkezi HTTPS adresini tanımla.

Windows Access üzerinde form oluşturma ve canlı kurum e-posta gönderimi bu teslimde doğrulanmadı. Sunucu tarafında Access istemcisinin HTTP akışı sentetik verilerle test edildi. Kurum genelinde açmadan önce BT ile iki ayrı bölüm hesabı, HTTPS, yedekten dönüş ve test posta kutusuyla pilot yap.

[Access form oluşturma](https://learn.microsoft.com/en-us/office/vba/api/access.application.createform) · [Access VBA modülüne kod ekleme](https://learn.microsoft.com/en-us/office/vba/api/access.module.insertlines)
