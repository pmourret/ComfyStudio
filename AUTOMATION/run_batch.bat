@echo off
REM Runner batch - lance ComfyUI AVANT d'utiliser ce script.
REM Exemples :
REM   run_batch.bat --dry-run
REM   run_batch.bat --category lifestyle
REM   run_batch.bat --scene cafe_terrasse --count 4
setlocal
call "%~dp0find_python.bat"
if errorlevel 1 (
    pause
    exit /b 1
)
"%COMFYUI_PYTHON%" "%~dp0runner.py" %*
echo.
pause
