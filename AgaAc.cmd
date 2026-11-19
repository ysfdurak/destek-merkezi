@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Destek Merkezi'ni yerel ağa HTTPS ile açar. Ayrıntı: AgaAc.ps1 ve KURULUM.md
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0AgaAc.ps1" %*
pause
