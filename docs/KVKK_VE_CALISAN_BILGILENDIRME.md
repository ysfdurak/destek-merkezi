# Destek Merkezi · KVKK ve çalışan bilgilendirme

> **Not:** Bu belge bir başlangıç şablonudur, hukuki görüş değildir. Kullanmadan önce kurumunun hukuk ya da KVKK sorumlusuna onaylat. Veri sorumlusu uygulamayı kuran kurumdur; bu depo yalnızca aracı sağlar.

Destek Merkezi, bölümler arası işgücü desteğini (kim, hangi gün, hangi bölüme, kaç saat destek verdi) kaydeder, onaylatır ve puantajla karşılaştırır. Bu kayıtlar çalışanın kişisel verisidir.

## Hangi kişisel veriler işleniyor?

| Veri | Nereden gelir | Neden gerekir |
|---|---|---|
| Kullanıcı hesabı: ad, e-posta, rol, parola özeti | Yönetici tanımlar | Giriş ve yetki |
| Personel: ad, sicil, bölüm, lokasyon | Yönetici tanımlar ya da Excel'den aktarır | Desteğin kime ait olduğunu bilmek |
| Destek kayıtları: tarih, saat, süre, veren ve alan bölüm, onay geçmişi | Bölüm yöneticileri girer | Desteği onaylatmak ve maliyeti doğru bölüme yazmak |
| Puantaj: sicil, tarih, giriş-çıkış, çalışma süresi, durum | Puantaj dosyasından aktarılır | Kayıtları gerçek çalışmayla karşılaştırmak |
| İşlem geçmişi: kim, ne zaman, neyi değiştirdi | Uygulama otomatik yazar | Denetim ve hata ayıklama |
| Hatırlatma e-postaları (açıksa): alıcı adresi, kayıt kodu | Microsoft 365 üzerinden | Onay bekleyen kaydı hatırlatmak |

## Nerede durur, kim görür, ne kadar kalır?

- **Yer:** Uygulamanın kurulu olduğu bilgisayar ya da sunucu: `veri/destek.sqlite`. Bulut yoktur; e-posta açıksa yalnız hatırlatma iletisi Microsoft 365 üzerinden gider.
- **Kim görür:** Yönetici her şeyi; bölüm yöneticisi kendi bölümünün ve onayına gelen kayıtları; izleyici yalnız okur. Yetkiler **Tanımlar ve kullanıcılar** ekranından verilir.
- **Ne kadar:** Uygulama kayıtları kendiliğinden silmez. Saklama süresini kurum belirlemeli (ör. puantaj ve destek kayıtları için ilgili mevzuattaki saklama yükümlülüğüyle uyumlu bir süre).
- **Yedekler:** Her gece `yedek/` klasörüne veritabanının **şifresiz** bir kopyası yazılır (küçük profilde 14, ortada 30, kurumsalda 90 kopya). Bu kopyalar aynı kişisel veriyi içerir.

## Kurumun yapması gerekenler

1. **Aydınlatma:** Çalışanlara, verinin hangi amaçla, hangi hukuki sebeple, kimler tarafından ve ne kadar süre işlendiğini yazılı olarak bildir (aşağıdaki duyuru şablonu başlangıç olabilir).
2. **Amaçla sınırla:** Toplanan veri yalnız yazılan amaç için kullanılır. Başka bir amaca (ör. disiplin, bireysel performans sıralaması) kaydırılacaksa yeniden değerlendir ve çalışanı bilgilendir.
3. **Erişimi daralt:** Yalnız işi gereği görmesi gerekenlere hesap aç; ayrılanların hesabını aynı gün kapat.
4. **Saklama süresini yaz ve uygula:** Süre dolan kayıtları sil ya da anonimleştir; silme tarihini kayıt altına al.
5. **Kayıt envanteri:** Bu işlemeyi kurumun kişisel veri envanterine ekle; VERBİS kaydı gerekiyorsa güncelle.
6. **Talepler:** Çalışanın KVKK 11. madde kapsamındaki taleplerine (bilgi, düzeltme, silme) kimin, kaç gün içinde cevap vereceğini belirle.

## Destek Merkezi'ne özel noktalar

- **Yedekleri koru:** `veri/` ve `yedek/` klasörlerini yalnız yöneticiler okuyabilmeli. Bilgisayarın diski BitLocker (Windows) ile şifrelenmeli; yedekler başka bir yere kopyalanıyorsa (USB, ağ sürücüsü) orada da şifreli tutulmalı.
- **Ağdan erişim HTTPS ister:** Başka cihazdan giriş yalnız HTTPS ile çalışır (KURULUM.md). Parola ve oturum ağda açık gitmez.
- **Gözetim algısı:** Destek kaydı bir süreç kaydıdır. Bireysel performans değerlendirmesinde ya da disiplin sürecinde tek başına kanıt olarak kullanılmamalı; duyuruda bunu açıkça yaz.
- **Puantaj aktarımı:** Aktarılan dosyada gereğinden fazla sütun (TC kimlik no, adres, maaş) varsa aktarmadan önce çıkar; uygulama yalnız sicil, tarih, saat ve durum alanlarını kullanır.

## Çalışan duyurusu (şablon)

Köşeli parantezli yerleri doldur.

> Bölümler arasında verilen işgücü desteğini doğru bölüme yazmak ve onaylatmak için [Kurum adı] olarak Destek Merkezi uygulamasını kullanıyoruz. Uygulamada adın, sicil numaran, bölümün, destek verdiğin tarih ve saatler ile puantaj kayıtların tutulur. Bu bilgileri yalnız [yönetici ve bölüm yöneticileri] görür; veriler kurum içindeki bilgisayarda tutulur, dışarıya gönderilmez. Kayıtlar [süre] saklanır, sonra silinir. Amaç süreçteki iş yükünü ve maliyeti doğru görmek; kayıtlar tek başına bireysel performans değerlendirmesinde kullanılmaz. Soruların ve KVKK kapsamındaki talepler için: [kişi / e-posta].

---
Son güncelleme: 19 Kasım 2026.
