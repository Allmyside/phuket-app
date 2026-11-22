@echo off
cd /d "%~dp0"
node scripts/update-rates.mjs --browser
if errorlevel 1 (
 echo Some sources failed. Previous quotes were retained. See messages above.
) else (
 echo Rates updated successfully.
)
pause
