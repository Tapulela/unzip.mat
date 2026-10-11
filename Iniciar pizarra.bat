@echo off
chcp 65001 >nul
title Pizarra local
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Falta instalar Node.js.
  echo   Descargalo de https://nodejs.org ^(version LTS^), instalalo y volve a abrir este archivo.
  echo.
  start "" "https://nodejs.org"
  pause
  exit /b
)
start "" cmd /c "timeout /t 2 >NUL & start http://localhost:3000"
node servidor.js
pause
