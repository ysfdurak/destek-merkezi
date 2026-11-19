# Destek Merkezi'ni yerel ağa HTTPS ile açar (tek komut).
#
# Ne yapar:
#   1. Bu bilgisayarın yerel ağ adresini bulur (ör. 192.168.1.20). İstersen -Ip ile kendin verirsin.
#   2. O adres için iki yıllık bir sertifika üretir: veri\sertifika.pfx (sunucu) ve veri\sertifika.cer (cihazlara).
#      Sertifika parolası rastgele üretilir ve ayarlar.json'a yazılır; senin hatırlaman gerekmez.
#   3. ayarlar.json'u günceller: host 0.0.0.0, baseUrl https://<adres>:<port>, tls alanı. Diğer ayarlar korunur.
#      Eski dosya ayarlar.json.yedek olarak saklanır.
#   4. Yönetici olarak çalıştırıldıysa Windows Güvenlik Duvarı'nda portu yalnız yerel ağa açar.
#
# Çalıştırma: AgaAc.cmd dosyasına çift tıkla (ya da PowerShell'de: .\AgaAc.ps1 [-Ip 192.168.1.20] [-Port 8732]).
# Sonra Baslat.cmd ile sunucuyu yeniden başlat. Diğer cihazlar https://<adres>:<port> adresine girer.
param(
  [string]$Ip = "",
  [int]$Port = 0
)
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Yaz($metin, $renk = "Gray") { Write-Host $metin -ForegroundColor $renk }

# 1) Yerel ağ adresi
if (-not $Ip) {
  $adaylar = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Where-Object { (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status -eq "Up" }
  $adaylar = @($adaylar | Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)' })
  if ($adaylar.Count -eq 0) { throw "Yerel ağ adresi bulunamadı. -Ip ile ver: .\AgaAc.ps1 -Ip 192.168.1.20" }
  if ($adaylar.Count -gt 1) {
    Yaz "Birden fazla ağ adresi bulundu:" Yellow
    for ($i = 0; $i -lt $adaylar.Count; $i++) { Yaz ("  [{0}] {1} ({2})" -f ($i + 1), $adaylar[$i].IPAddress, $adaylar[$i].InterfaceAlias) }
    $secim = Read-Host "Hangisi? Numara yaz"
    $Ip = $adaylar[[int]$secim - 1].IPAddress
  } else { $Ip = $adaylar[0].IPAddress }
}
if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw "Geçersiz IP adresi: $Ip" }

# 2) Ayarlar
$ayarYolu = Join-Path $PSScriptRoot "ayarlar.json"
if (-not (Test-Path $ayarYolu)) { Copy-Item (Join-Path $PSScriptRoot "ayarlar.ornek.json") $ayarYolu }
$ayar = Get-Content $ayarYolu -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $Port) { $Port = if ($ayar.port) { [int]$ayar.port } else { 8732 } }

# 3) Sertifika (parola rastgele; ayarlar.json'da saklanır)
$veri = Join-Path $PSScriptRoot "veri"
New-Item -ItemType Directory -Force -Path $veri | Out-Null
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$parola = [Convert]::ToBase64String($bytes) -replace '[+/=]', 'x'
$guvenli = ConvertTo-SecureString $parola -AsPlainText -Force
Yaz "Sertifika üretiliyor: $Ip ..." Cyan
$cert = New-SelfSignedCertificate -Subject "CN=$Ip" -FriendlyName "Destek Merkezi ($Ip)" `
  -TextExtension @("2.5.29.17={text}IPAddress=$Ip") -CertStoreLocation Cert:\CurrentUser\My `
  -NotAfter (Get-Date).AddYears(2) -KeyExportPolicy Exportable -KeyAlgorithm RSA -KeyLength 2048
$pfx = Join-Path $veri "sertifika.pfx"; $cer = Join-Path $veri "sertifika.cer"
try {
  Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $guvenli -CryptoAlgorithmOption AES256_SHA256 | Out-Null
} catch {
  # Eski Windows sürümleri AES256_SHA256 seçeneğini tanımaz.
  Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $guvenli | Out-Null
}
Export-Certificate -Cert $cert -FilePath $cer | Out-Null
# Anahtarın kopyası artık dosyada; Windows sertifika deposundaki kopyayı kaldır.
Remove-Item -Path ("Cert:\CurrentUser\My\" + $cert.Thumbprint) -ErrorAction SilentlyContinue

# 4) ayarlar.json'u güncelle (eskisi yedeklenir)
Copy-Item $ayarYolu "$ayarYolu.yedek" -Force
$ayar | Add-Member -NotePropertyName host -NotePropertyValue "0.0.0.0" -Force
$ayar | Add-Member -NotePropertyName port -NotePropertyValue $Port -Force
$ayar | Add-Member -NotePropertyName baseUrl -NotePropertyValue "https://${Ip}:$Port" -Force
$ayar | Add-Member -NotePropertyName tls -NotePropertyValue ([pscustomobject]@{ pfx = "veri/sertifika.pfx"; parola = $parola }) -Force
$ayar | ConvertTo-Json -Depth 10 | Set-Content -Path $ayarYolu -Encoding UTF8

# 5) Klasör izinleri: veri klasörünü yalnız bu kullanıcı, yöneticiler ve sistem okusun (sertifika ve veritabanı burada).
#    Sunucuyu başka bir Windows hesabıyla (ör. hizmet olarak) çalıştıracaksan o hesaba da izin ver.
try {
  icacls $veri /inheritance:r /grant:r "${env:USERDOMAIN}\${env:USERNAME}:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null
  $yedek = Join-Path $PSScriptRoot "yedek"
  if (Test-Path $yedek) { icacls $yedek /inheritance:r /grant:r "${env:USERDOMAIN}\${env:USERNAME}:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null }
  icacls $ayarYolu /inheritance:r /grant:r "${env:USERDOMAIN}\${env:USERNAME}:F" "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null
} catch { Yaz "Uyarı: klasör izinleri ayarlanamadı. veri klasörünü ve ayarlar.json'u yalnız yöneticilere aç." Yellow }

# 6) Güvenlik duvarı (yalnız yönetici olarak çalıştırıldıysa; yalnız yerel ağ)
$yonetici = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($yonetici) {
  Get-NetFirewallRule -DisplayName "Destek Merkezi (HTTPS)" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName "Destek Merkezi (HTTPS)" -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Action Allow -Profile Private,Domain | Out-Null
  Yaz "Güvenlik duvarı: $Port portu yalnız yerel ağa açıldı." Green
} else {
  Yaz "Güvenlik duvarı kuralı eklenmedi (yönetici değilsin). İlk açılışta Windows izin sorarsa yalnız 'Özel ağlar'ı işaretle." Yellow
}

Yaz ""
Yaz "Hazır." Green
Yaz "  Adres: https://${Ip}:$Port"
Yaz "  Şimdi Baslat.cmd ile sunucuyu yeniden başlat."
Yaz "  Diğer cihazlar ilk girişte 'bağlantı gizli değil' uyarısı görür. Kaldırmak için veri\sertifika.cer dosyasını"
Yaz "  her cihaza 'Güvenilen kök sertifika yetkilileri' olarak yükle (KURULUM.md › Yerel ağa açma)."
Yaz "  Bilgisayarın IP adresi değişirse bu betiği yeniden çalıştır (yönlendiricide sabit IP vermek iyi olur)."
