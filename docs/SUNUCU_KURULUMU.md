# Sunucu kurulumu (Docker / VPS)

Destek Merkezi iki şekilde çalışır:

| | Windows makinede | Docker ile VPS'te |
|---|---|---|
| Ayar | `ayarlar.json` | `.env` (ortam değişkenleri) |
| HTTPS | Uygulamanın kendi sertifikası | Önündeki Caddy |
| İlk yönetici | Tarayıcıda, sunucunun başında | `node server/kur.mjs` komutuyla |
| Rehber | [KURULUM.md](../KURULUM.md) | Bu belge |

Docker kurulumunda uygulama düz HTTP ile `8080` portunda çalışır ve dışarıya port açmaz. HTTPS'i önündeki Caddy sağlar. Caddy, isteği alan adına göre uygulamaya iletir.

## İki kullanım modu

**Demo modu (`DEMO_MODE=true`):** Portföy sitesi içindir.

- Siteye gelen herkes "Örnek verilerle dene" düğmesiyle, giriş yapmadan, yalnızca kendisine ait bir alan açar.
- Alan kurgusal bir depo organizasyonuyla dolu gelir.
- Her alan ayrı bir SQLite dosyasıdır (`/data/demo/`). Son kullanımdan `DEMO_TTL_HOURS` saat sonra tümüyle silinir.
- Giriş, ilk kurulum, parola ve e-posta kapalıdır. Yedek alınmaz.
- Kötüye kullanımı sınırlamak için aynı anda en fazla `DEMO_MAX` alan açılabilir. Bir IP adresi de saatte en fazla `DEMO_PER_IP_HOUR` alan açabilir.
- Demo modunda gerçek personel verisi girilmemelidir.

**Kurum modu (`DEMO_MODE=false`):** Tek bir şirket çalışma alanı içindir. Kullanıcılar e-posta ve parolayla girer. Veri `/data/destek.sqlite` dosyasındadır, her gece `/data/backups` altına kopyası alınır.

## ysfdurak.com ortak altyapısında

Ortak Caddy ve `web` ağı kurulu olmalıdır (github.com/ysfdurak/ysfdurak.com → `sunucu/`). Kurulum tek komuttur:

```bash
ssh yusuf@SUNUCU_IP
bash ~/ysfdurak.com/sunucu/kurulum-destek.sh
```

Betik sırayla şunları yapar:

1. Kodu indirir.
2. `.env` dosyasını demo moduyla oluşturur.
3. İmajı derleyip konteyneri başlatır.
4. Caddy'yi yeniden yükler.

Tekrar çalıştırmak güvenlidir; kodu günceller, `.env` dosyasına dokunmaz.

Önce Cloudflare DNS'te `destek` için bir A kaydı açın (sunucu IP'si, proxy açık). Sertifikayı Caddy kendisi alır.

## Tek başına bir sunucuda

```bash
git clone https://github.com/ysfdurak/destek-merkezi.git && cd destek-merkezi
cp .env.example .env              # DESTEK_BASE_URL ve DEMO_MODE'u düzenleyin
nano deploy/Caddyfile             # alan adını yazın
cd deploy && docker compose -f docker-compose.tek.yml up -d --build
```

Kurum modunda ilk yöneticiyi oluşturun:

```bash
docker exec -it deploy-destek-1 node server/kur.mjs
```

Ortak altyapıda konteynerin adı `destek` olur.

## Güncelleme, günlük, yedek

| İş | Komut |
|---|---|
| Güncelle | `git pull && cd deploy && docker compose -f docker-compose.ortak.yml up -d --build` |
| Günlük | `docker logs --tail 50 destek` |
| Sağlık | `curl -s http://127.0.0.1:8080/healthz` (konteyner içinden) veya `docker ps` → `healthy` |
| Demo sayaçları | `docker exec destek node server/demo-istatistik.mjs` |
| Kurum yedeği dışarı al | `docker cp destek:/data/backups ./destek-yedek` |

## Demo sayaçları

`/data/demo/istatistik.db` içinde gün başına yalnızca üç adet tutulur:

- açılan alan sayısı (`olusturma`)
- geri dönülen alan sayısı (`devam`)
- yapılan işlem sayısı (`islem`)

IP adresi, çerez veya kişisel veri saklanmaz. IP adresleri yalnızca saatlik açma sınırı için bellekte tutulur.

## Güvenlik notları

- Uygulama yalnızca `DESTEK_BASE_URL` alan adından gelen istekleri kabul eder. Başka kaynaktan gelen POST isteklerini reddeder.
- Çerezler `HttpOnly`, `Secure` ve `SameSite=Strict` ayarlıdır.
- Konteyner `node` kullanıcısıyla, root olmadan çalışır.
- Gerçek istemci adresi `CF-Connecting-IP` ya da `X-Forwarded-For` başlığından okunur. Bu yalnızca demo açma sınırında kullanılır.
