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
    rem Kaynak paketten ilk acilis: bagimliliklar kurulur ve arayuz derlenir.
    echo Ilk acilis: bagimliliklar kuruluyor ve arayuz derleniyor. Bu bir kez yapilir, birkac dakika surebilir.
    if not exist "node_modules" (
        call npm.cmd ci
        if errorlevel 1 (
            echo npm ci basarisiz oldu. Internet baglantisini kontrol edin; ayrintilar yukarida.
            pause
            exit /b 1
        )
    )
    call npm.cmd run build
    if errorlevel 1 (
        echo Arayuz derlenemedi; ayrintilar yukarida.
        pause
        exit /b 1
    )
)
if not exist "ayarlar.json" (
    copy /y "ayarlar.ornek.json" "ayarlar.json" >nul
    if errorlevel 1 exit /b 1
)
node "server\main.mjs" --open
if errorlevel 1 pause
