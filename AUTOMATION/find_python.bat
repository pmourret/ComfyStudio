@echo off
REM Resout l'interpreteur Python de ComfyUI depuis .env (racine du repo), pour
REM les lanceurs run_web.bat / run_batch.bat. Ne pas appeler directement :
REM   call "%~dp0find_python.bat"
REM   if errorlevel 1 exit /b 1
REM Definit COMFYUI_PYTHON dans l'environnement de l'appelant, ou renvoie 1.
REM
REM Avant J1 ces lanceurs calculaient ce chemin par position relative
REM (set ROOT=%%~dp0..\..\..\..) : ca supposait le repo DANS l'installation
REM ComfyUI. Le fork a casse cette hypothese (ADR-0008) - .env est la meme
REM configuration explicite que AUTOMATION/env_config.py lit cote Python.
setlocal
set "ENVFILE=%~dp0..\.env"
if not exist "%ENVFILE%" (
    echo ERREUR : %ENVFILE% introuvable.
    echo Copier .env.example vers .env a la racine du repo et renseigner COMFYUI_ROOT.
    exit /b 1
)

set "_ROOT="
set "_PYTHON="
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENVFILE%") do (
    if "%%A"=="COMFYUI_ROOT" set "_ROOT=%%B"
    if "%%A"=="COMFYUI_PYTHON" set "_PYTHON=%%B"
)

if not defined _PYTHON if not defined _ROOT (
    echo ERREUR : COMFYUI_ROOT non defini dans %ENVFILE%
    exit /b 1
)
if not defined _PYTHON set "_PYTHON=%_ROOT%\..\python_embeded\python.exe"

if not exist "%_PYTHON%" (
    echo ERREUR : python introuvable a %_PYTHON%
    echo Verifier COMFYUI_ROOT ^(ou COMFYUI_PYTHON^) dans %ENVFILE%
    exit /b 1
)

endlocal & set "COMFYUI_PYTHON=%_PYTHON%"
