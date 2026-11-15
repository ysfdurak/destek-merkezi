# İngilizce arayüz nasıl çalışıyor?

Destek Merkezi Türkçe yazılır ve Türkçe kalır. İngilizce, kaynağa dokunmadan **tek bir sözlükle** eklenir:
`lib/i18n/en.json` (Türkçe metin → İngilizce metin).

## Dil nasıl seçilir?

1. Adreste `?lang=en` ya da `?lang=tr` varsa o dil (portföy sitesinin “Dene” bağlantısı bunu kullanır).
2. Yoksa `destek_dil` çerezi (dil seçilince bir yıllığına yazılır).
3. Hiçbiri yoksa Türkçe.

Kenar çubuğunda ve giriş ekranında **English / Türkçe** düğmesi var; basınca çerez değişir, sayfa yeniden yüklenir.

## Üç parça

| Parça | Dosya | Ne yapar |
| --- | --- | --- |
| Derleme eklentisi | `ceviri/vite-ceviri.js` | Derlemede (esbuild) `app/` ve `lib/` altındaki kodu okur; TypeScript önce JSX korunarak JavaScript'e çevrilir. Sözlükte karşılığı olan her Türkçe metni dile göre seçilen bir çağrıya çevirir: `"Yeni iş"` → `__t("Yeni iş")`, `` `${n} iş seçildi` `` → `__tt("{0} iş seçildi", n)`, `'tr-TR'` → `__L()` (tarih biçimi). Sözlükte olmayan metne dokunmaz. |
| Çalışma anı | `app/i18n.js` | Dili belirler, `__t`, `__tt`, `__L` ve `tMessage` (sunucudan gelen hazır iletiyi çevirir) fonksiyonlarını verir. |
| Sunucu | `server/i18n.mjs` | Aynı sözlükle JSON hata iletilerini çevirir; ziyaretçi demosunu seçilen dilde açar (birimler, roller, açıklamalar ve geçmiş İngilizce gelir). |

`lib/i18n/translate.mjs` iki tarafın ortak çeviricisidir: önce birebir arar, sonra `{0}` kalıplarıyla
(ör. `"İş atandı: {0}"` → `"Task assigned: {0}"`, sunucunun ürettiği bildirim başlıkları için).

## Yeni metin eklediğimde ne yapmalıyım?

1. Kodu her zamanki gibi Türkçe yaz.
2. `node ceviri/cikar.js --dosyali` sözlükte karşılığı olmayan metinleri dosyalarıyla listeler.
3. Her birinin İngilizcesini `lib/i18n/en.json`'a ekle (anahtar Türkçe metnin **tam** hâli; şablonlarda `{0}`, `{1}`).
4. CSS sınıfı gibi metin olmayan dizgiler listede çıkabilir; onları sözlüğe ekleme.

Sözlüğe eklenmeyen metin İngilizce arayüzde Türkçe görünür; bir şey bozulmaz.

## Dikkat edilecekler

- **Metne göre karar veren kod yazma.** Örn. `err.message.includes('Kayıt değişti')` İngilizcede çalışmaz, çünkü o dizgi de çevrilir. Durum kodu, kimlik ya da iki dili de tanıyan bir düzenli ifade kullan (`/Kayıt değişti|The record changed/`).
- Sözlükteki metin bir `aria-label` ise, onu arayan `querySelector` dizgisinin de çevirisi olmalı (ör. `[aria-label="Hızlı iş adı"]`).
- Kişi adları ve kullanıcının yazdığı içerik çevrilmez.
- Nesne anahtarı olarak yazılan Türkçe metinler de (ör. Excel sütun başlıkları `{ 'Başlangıç': … }`) çevrilir.
- Çoğul ve küçük harf kuralı (`lib/org.mjs` → `plural`, `lower`) arayüz İngilizceyse İngilizce kurala geçer; yüzde işareti İngilizcede sayıdan sonra yazılır.
- Excel içe aktarma eş adları (`lib/import.mjs` → `aliases`) sözlüğe **eklenmez**: Türkçe başlıklı puantaj dosyaları her iki dilde de okunur. İngilizce şablon için birkaç İngilizce eş ad eklendi.
- Access istemcisi ve e-postalar Türkçe kalır; Access isteklerinde sunucu iletileri çevrilmez.
- Dil değiştirmek mevcut demo alanının verisini değiştirmez; İngilizce örnek veri için "Yeni demo alanı aç".

## Test

`tests/i18n.test.mjs`: sözlükte boş karşılık olmaması, kalıplı çeviri, sunucu sayfası çevirisi, dil seçimi ve İngilizce örnek veri (kimlik ve durum kodları değişmeden).
