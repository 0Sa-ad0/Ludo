@echo off
title Ludo Game Server
color 0A
REM Always run from the game folder, however this was launched.
cd /d "%~dp0"
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
echo  [2/3] Starting Ludo Game Server on port 4000...
echo.

REM Fixed free ngrok domain, so the link never changes between restarts.
REM Get your own at https://dashboard.ngrok.com -> Domains (one free per account).
set NGROK_DOMAIN=staring-boil-widen.ngrok-free.dev

REM ngrok runs hidden inside THIS window - no second window. Its own output
REM goes to ngrok.log; the game prints the public link once the tunnel is up.
where ngrok >nul 2>&1
if errorlevel 1 goto no_ngrok

REM Already running (e.g. left over from an earlier run)? Reuse it - a second
REM copy would be refused, since the free domain allows one tunnel at a time.
curl -s -o nul http://127.0.0.1:4040/api/tunnels >nul 2>&1
if not errorlevel 1 goto ngrok_reused

echo  [3/3] Starting ngrok tunnel in the background...
start "" /B ngrok http 4000 --url https://%NGROK_DOMAIN% --log=stdout > ngrok.log 2>&1
goto ngrok_done

:ngrok_reused
echo  [3/3] ngrok is already running - reusing it.
goto ngrok_done

:no_ngrok
echo  [3/3] ngrok not found - only local WiFi available.
echo  Install ngrok from https://ngrok.com/download for internet access.

:ngrok_done
echo.
echo  =============================================
echo    Game running at: http://localhost:4000
echo    Share the link shown below (or inside the game)
echo    Close this window to stop the game and ngrok.
echo  =============================================
echo.

node server.js

REM The game has stopped - stop the background ngrok with it.
taskkill /IM ngrok.exe /F >nul 2>&1
pause
