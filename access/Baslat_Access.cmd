@echo off
setlocal
cd /d "%~dp0"
if not exist "Sunucu_Adresi.txt" (
    copy /y "Sunucu_Adresi.ornek.txt" "Sunucu_Adresi.txt" >nul
    if errorlevel 1 exit /b 1
)
if exist "Destek_Merkezi.accdb" (
    start "" "%~dp0Destek_Merkezi.accdb"
    exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Access_Olustur.ps1"
if errorlevel 1 pause
