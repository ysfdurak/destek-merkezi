# Destek Merkezi: Node.js kurulumu gerektirmeyen Windows paketini üretir.
#
# Ne yapar:
#   1. Resmî Node.js Windows zip'ini (nodejs.org, sürümü aşağıda sabit) indirir ve SHA-256 değerini doğrular.
#      Tutmazsa durur. Pakete yalnızca node.exe ve Node.js lisansı girer (npm gerekmez).
#   2. Derlenmiş arayüzü (public), sunucuyu (server, lib), Access istemcisini, betikleri ve belgeleri kopyalar.
#      Yerel denemeden kalmış kişisel dosyalar (veri, yedek, ayarlar.json, .accdb, Sunucu_Adresi.txt) pakete girmez.
#   3. dist\destek-merkezi-<sürüm>-windows-x64.zip ve yanına .sha256 dosyasını yazar.
#
# Çalıştırma (depo kökünde, Windows): npm ci; npm run build; pwsh -File paket\paketle.ps1
# Node.js sürümünü yükseltirken iki satırı birlikte değiştir: değer, nodejs.org/dist/v<sürüm>/SHASUMS256.txt
# dosyasındaki node-v<sürüm>-win-x64.zip satırıdır.
param([string]$Cikti = "dist")
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$NodeSurum = "24.22.3"
$NodeSha256 = "e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f"

$kok = Split-Path -Parent $PSScriptRoot
$surum = (Get-Content (Join-Path $kok "package.json") -Raw | ConvertFrom-Json).version
if (-not (Test-Path (Join-Path $kok "public\app.js"))) { throw "public\app.js yok. Önce npm ci ve npm run build çalıştırın." }

$ad = "destek-merkezi-$surum-windows-x64"
$cikti = if ([IO.Path]::IsPathRooted($Cikti)) { $Cikti } else { Join-Path $kok $Cikti }
$gecici = Join-Path $cikti "gecici"
$hedef = Join-Path $cikti $ad
if (Test-Path $cikti) { Remove-Item -Recurse -Force $cikti }
New-Item -ItemType Directory -Force $gecici, $hedef | Out-Null

# 1) Node.js
$nodeAd = "node-v$NodeSurum-win-x64"
$nodeZip = Join-Path $gecici "$nodeAd.zip"
Write-Host "Node.js $NodeSurum indiriliyor..."
Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeSurum/$nodeAd.zip" -OutFile $nodeZip
$bulunan = (Get-FileHash $nodeZip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($bulunan -ne $NodeSha256) { throw "Node.js zip SHA-256 tutmuyor. Beklenen $NodeSha256, bulunan $bulunan" }
Write-Host "Node.js SHA-256 doğrulandı: $bulunan"
Expand-Archive -Path $nodeZip -DestinationPath $gecici
$nodeHedef = Join-Path $hedef "runtime\node"
New-Item -ItemType Directory -Force $nodeHedef | Out-Null
Copy-Item (Join-Path $gecici "$nodeAd\node.exe"), (Join-Path $gecici "$nodeAd\LICENSE") $nodeHedef

# 2) Uygulama
foreach ($klasor in "server", "lib", "public", "access", "lisanslar", "docs") {
  Copy-Item -Recurse (Join-Path $kok $klasor) (Join-Path $hedef $klasor)
}
foreach ($dosya in "Baslat.cmd", "AgaAc.cmd", "AgaAc.ps1", "ayarlar.ornek.json", "README.md", "KURULUM.md", "LICENSE.md") {
  Copy-Item (Join-Path $kok $dosya) $hedef
}
Get-ChildItem (Join-Path $hedef "access") -File |
  Where-Object { $_.Name -eq "Sunucu_Adresi.txt" -or $_.Extension -in ".accdb", ".laccdb", ".ldb", ".mdb", ".accde" } |
  Remove-Item -Force
$commit = if ($env:GITHUB_SHA) { $env:GITHUB_SHA } else { (git -C $kok rev-parse HEAD 2>$null) }
$bilgi = "Destek Merkezi $surum`r`nNode.js $NodeSurum (win-x64, nodejs.org, SHA-256 $NodeSha256)`r`nKaynak: https://github.com/ysfdurak/destek-merkezi/commit/$commit`r`n"
[IO.File]::WriteAllText((Join-Path $hedef "SURUM.txt"), $bilgi)

# 3) Zip ve sağlama toplamı
$zip = Join-Path $cikti "$ad.zip"
Compress-Archive -Path $hedef -DestinationPath $zip -CompressionLevel Optimal
$zipSha = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$zip.sha256", "$zipSha  $ad.zip`n")
Remove-Item -Recurse -Force $gecici
Write-Host "Paket: $zip"
Write-Host "SHA-256: $zipSha"
