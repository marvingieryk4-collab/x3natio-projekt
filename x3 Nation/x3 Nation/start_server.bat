@echo off
title X3 Nation Server
cd /d "%~dp0"
echo ========================================================
echo   X3 Nation - Liquid Glass Flasher Server
echo ========================================================
echo.
echo Starte Webserver auf http://localhost:8080 ...
echo Web Bluetooth & Discord OAuth bereit.
echo.

if exist "C:\Users\Looping\AppData\Local\Programs\Python\Python314\python.exe" (
    "C:\Users\Looping\AppData\Local\Programs\Python\Python314\python.exe" server.py
) else (
    python server.py
)

pause
