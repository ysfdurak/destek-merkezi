# vendor/

## xlsx-0.20.3.tgz (SheetJS Community Edition 0.20.3, Apache-2.0)

npm'deki `xlsx` paketi 0.18.5'te kaldı ve bilinen yüksek önemde açıkları var
(prototip kirletme, ReDoS; GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). SheetJS yeni
sürümleri yalnız kendi sunucusundan dağıtıyor ve projeye dosya olarak eklenmesini
öneriyor. `package.json` bu dosyayı `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` ile kurar;
koddaki `import('xlsx')` değişmez.

Kaynak ve doğrulama (Kasım 2026): paket, SheetJS 0.20.3'ün npm aynası `@e965/xlsx@0.20.3`
`npm pack` ile alındı (npm imza/bütünlük denetimiyle). İçindeki `dist/xlsx.full.min.js`,
Sırdaş deposundaki SheetJS 0.20.3 kopyasıyla bayt bayt aynıdır
(sha256 `cc015130aa8521e7f088…`).

Güncellemek için: https://cdn.sheetjs.com/ adresinden yeni `xlsx-X.Y.Z.tgz` dosyasını indir,
buraya koy, `package.json`'daki yolu değiştir, `npm install` çalıştır.
