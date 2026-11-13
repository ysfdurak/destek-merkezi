@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Destek Merkezi Sunucusu
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js 24 gereklidir. README.md dosyasina bakin.
    pause
    exit /b 1
)
if not exist "public\app.js" (
    echo Once npm ci ve npm run build komutlarini calistirin.
    pause
    exit /b 1
)
if not exist "ayarlar.json" (
    copy /y "ayarlar.ornek.json" "ayarlar.json" >nul
    if errorlevel 1 exit /b 1
)
node "server\main.mjs" --open
if errorlevel 1 pause
