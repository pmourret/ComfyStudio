@echo off
REM Tableau de bord Lena. Demarre ComfyUI si besoin, puis le dashboard.
REM
REM   run_web.bat                 -> demarre ComfyUI (s'il ne tourne pas deja)
REM                                  puis http://127.0.0.1:8189
REM   run_web.bat --no-comfy      -> ne touche pas a ComfyUI (gere a la main)
REM   run_web.bat --no-browser    -> n'ouvre pas le navigateur
REM   run_web.bat --host 0.0.0.0  -> accessible depuis le telephone
REM                                  (reseau de confiance : aucune authentification)
REM
REM ComfyUI s'ouvre dans SA PROPRE FENETRE : c'est la que sortent ses logs.
REM Il n'est pas arrete en quittant le dashboard (un batch peut etre en file) ;
REM fermer sa fenetre a la main pour liberer la VRAM.
setlocal
call "%~dp0find_python.bat"
if errorlevel 1 (
    pause
    exit /b 1
)
"%COMFYUI_PYTHON%" "%~dp0web\app.py" %*
pause
