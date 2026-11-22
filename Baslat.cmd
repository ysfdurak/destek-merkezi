@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Destek Merkezi Sunucusu
rem Hazir pakette Node.js runtime\node klasorundedir; kurulum gerekmez.
rem Kaynak kodda (paket disinda) bilgisayara kurulu Node.js 24 kullanilir.
set "NODE_EXE=node"
if exist "runtime\node\node.exe" (
    set "NODE_EXE=%CD%\runtime\node\node.exe"
) else (
    where node >nul 2>&1
    if errorlevel 1 (
        echo Node.js 24 gereklidir ya da Releases sayfasindaki hazir Windows paketini indirin. README.md dosyasina bakin.
        pause
        exit /b 1
    )
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
"%NODE_EXE%" "server\main.mjs" --open
if errorlevel 1 pause
