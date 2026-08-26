@echo off
REM Runner batch Lena - lance ComfyUI AVANT d'utiliser ce script.
REM Exemples :
REM   run_batch.bat --dry-run
REM   run_batch.bat --category lifestyle
REM   run_batch.bat --scene cafe_terrasse --count 4
setlocal
set ROOT=%~dp0..\..\..\..
"%ROOT%\python_embeded\python.exe" "%~dp0lena_batch.py" %*
echo.
pause
