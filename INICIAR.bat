@echo off
title Quien chucha revuelve - servidor
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No se encontro Node.js en este equipo.
  echo   Instalalo desde https://nodejs.org y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

node server.js %1
echo.
echo   El servidor se detuvo.
pause
