@echo off
title X3 Nation Server
cd /d "%~dp0"
echo ========================================================
echo   X3 Nation - Liquid Glass Flasher Server
echo ========================================================
echo.

set "PY_CMD="
where py >nul 2>&1 && set "PY_CMD=py"
if not defined PY_CMD where python >nul 2>&1 && set "PY_CMD=python"
if not defined PY_CMD if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PY_CMD=%LOCALAPPDATA%\Python\bin\python.exe"
if not defined PY_CMD if exist "%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe" set "PY_CMD=%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe"
if not defined PY_CMD if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"

if not defined PY_CMD (
    echo [FEHLER] Kein Python gefunden! Bitte installiere Python oder fuege es zum PATH hinzu.
    pause
    exit /b 1
)

echo Starte Server mit: %PY_CMD%
echo Webserver erreichbar unter: http://localhost:8080/
echo.
"%PY_CMD%" server.py
pause
