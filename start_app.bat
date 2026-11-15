@echo off
title VanSales SaaS - PHP MVC + ReactJS (Port 3036)
echo ========================================================
echo   Starting SaNDS VanSales SaaS Application
echo   Database : van_sales_db (localhost:3306)
echo   Backend  : PHP MVC API on http://127.0.0.1:8000
echo   Frontend : ReactJS App on http://localhost:3036
echo ========================================================
echo.

:: Start PHP MVC Backend API in a minimized window
start "VanSales PHP API (8000)" /min cmd /c "php -S 127.0.0.1:8000 -t D:\LatestProjects\VanSales\backend\public"

:: Give PHP a moment to bind port 8000
timeout /t 2 /nobreak >nul

:: Start ReactJS Frontend on Port 3036
cd /d "D:\LatestProjects\VanSales\frontend"
echo Launching ReactJS Frontend on http://localhost:3036 ...
npm run dev -- --port 3036 --host
pause

