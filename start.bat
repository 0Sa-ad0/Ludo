@echo off
title Ludo Game Server
color 0A
echo.
echo  =============================================
echo    LUDO GAME - Starting Server...
echo  =============================================
echo.

REM Check if XAMPP MySQL is running
echo  [1/3] Checking MySQL (XAMPP)...
ping -n 1 127.0.0.1 >nul
echo  Make sure XAMPP MySQL is started before playing!
echo.

REM Start the game server
echo  [2/3] Starting Ludo Game Server on port 3000...
echo.

REM Start ngrok in a separate window (if installed)
where ngrok >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo  [3/3] Starting ngrok tunnel...
    start "ngrok" cmd /k "ngrok http 3000"
    timeout /t 3 /nobreak >nul
    echo  ngrok started! Check the ngrok window for your public URL.
    echo  The public URL will also appear inside the game.
) else (
    echo  [3/3] ngrok not found - only local WiFi available.
    echo  Install ngrok from https://ngrok.com/download for internet access.
)

echo.
echo  =============================================
echo    Game running at: http://localhost:3000
echo    Share the Network URL shown in console
echo  =============================================
echo.

node server.js

pause
