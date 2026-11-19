# Mülakatta sorulabilecek sorular · Destek Merkezi

Bu kart, projeyi kendi ağzınla anlatabilmen için. Cevaplar kısa tutuldu; ayrıntısı belirtilen belgede. Kod yapay zekâ (Claude) ile yazıldı; kapsam, öncelik ve aşağıdaki kararlar senin. Bunu saklama, açıkça söyle: "Ürünü ve kararları ben belirledim, kodu yapay zekâyla yazdım, her kararın nedenini anlatabilirim."

**1. Bu proje ne yapıyor?**
Bölümler arasında verilen işgücü desteğini kaydediyor, karşı bölüme onaylatıyor ve puantajla karşılaştırıyor. Depo ve üretim gibi vardiyalı işletmeler için.

**2. Hangi gerçek sorundan çıktı?**
Destek talebi WhatsApp'tan gelir, kayıt günün sonunda ya da haftalar sonra girilir. Kimin kime ne kadar destek verdiği ve maliyetin hangi bölüme yazılacağı tartışmalı kalır.

**3. Kayıtların doğruluğunu nasıl sağlıyorsun?**
Karşı bölüm onayı, aynı kişiye aynı tarihte ikinci kayıt engeli ve puantajla karşılaştırma: o gün gelmeyen ya da çalıştığından fazla destek yazılan kişi 'uyumsuz destek' ekranına düşer.

**4. Neden adam-saat ya da verimlilik hesabı yok?**
Bilinçli bir karar: program kayıt ve kişi sayısıyla çalışır. Verimlilik hesabı bireysel performans ölçümüne kayar ve çalışana gözetim gibi gelir.

**5. Teknik yapı?**
Node.js 24, yalnız yerleşik modüller (node:sqlite, node:http, node:crypto); arayüz React. İş kuralları tek çekirdekte (lib/domain.mjs › applyAction), sunucu ve testler aynı kuralı kullanır. İsteğe bağlı Access istemcisi var.

**6. Nasıl kurulur?**
Küçük işletmede bir Windows bilgisayarda Baslat.cmd ile; kurumda bir sunucuda Docker ile. Kurulum profili (küçük, orta, kurumsal) yedek sayısını ve ağ kurallarını belirler.

**7. Başka cihazdan erişim nasıl güvenli?**
Başka cihazdan giriş HTTPS ister. HTTPS yoksa yalnız uygulamanın kurulu olduğu bilgisayardan giriş yapılır; telefon 'bağlantı şifreli değil' uyarısı görür. AgaAc.cmd tek tıkla sertifika üretip ayarları yapar.

**8. Veriler nerede, ne kadar kalıyor?**
Kurulduğu bilgisayarda SQLite dosyasında; her gece yedek alınır. Saklama süresini kurum belirler; KVKK notu ve çalışan duyurusu şablonu docs/KVKK_VE_CALISAN_BILGILENDIRME.md'de.

**9. Canlı demo nasıl çalışıyor?**
Her ziyaretçiye kurgusal verili ayrı bir alan açılıyor, son kullanımdan 3 gün sonra siliniyor. IP başına saatlik alan sınırı var; IP yalnız güvenilen vekilden okunuyor, sahte başlıkla aşılamıyor.

**10. Neyi farklı yapardın?**
Ağ erişimini baştan HTTPS zorunlu tasarlardım. İlk sürümde küçük profil yerel ağa HTTP ile açılabiliyordu ve parola ağda şifresiz gidiyordu.


## Bu projede verdiğim kararlar (sorun → karar → bedel)

- **Yerel ağda HTTP:** Parola ve oturum ağda açık gidiyordu → başka cihazdan giriş HTTPS ister, sertifika sihirbazı eklendi → küçük işletme için kurulum bir adım uzadı, cihazlara sertifika yüklemek gerekiyor.
- **Verimlilik hesabı yok:** Gözetim algısı ve yanlış kullanım riski → yalnız kayıt ve kişi sayısı → bazı yöneticiler adam-saat isteyebilir.
- **Sahte IP başlığı:** Demo sınırı istemcinin yazdığı başlıktan okunuyordu → yalnız güvenilen vekilden okunuyor → Cloudflare adres listesi elle güncel tutulmalı.

---
Son güncelleme: 19 Kasım 2026.
