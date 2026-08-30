@echo off
REM Tableau de bord. Demarre ComfyUI si besoin, puis le dashboard.
REM
REM   run_web.bat                 -> demarre ComfyUI (s'il ne tourne pas deja)
REM                                  puis http://127.0.0.1:8189
REM                                  documentation d'API : /docs
REM   run_web.bat --no-comfy      -> ne touche pas a ComfyUI (gere a la main)
REM   run_web.bat --no-browser    -> n'ouvre pas le navigateur
REM   run_web.bat --host 0.0.0.0  -> accessible depuis le telephone
REM                                  (reseau de confiance : aucune authentification)
REM
REM ComfyUI s'ouvre dans SA PROPRE FENETRE : c'est la que sortent ses logs.
REM Il n'est pas arrete en quittant le dashboard (un batch peut etre en file) ;
REM fermer sa fenetre a la main pour liberer la VRAM.
REM
REM Un tableau de bord deja lance sur le meme port (fenetre precedente fermee
REM sans Ctrl-C) est arrete automatiquement au demarrage (app.py reclaim_port).
REM
REM ---------------------------------------------------------------------------
REM UN SEUL INTERPRETEUR, CELUI DE COMFYUI (ADR-0008), ET C'EST TOUJOURS VRAI
REM APRES LA MIGRATION FASTAPI.
REM
REM Le studio tourne sur %COMFYUI_PYTHON% et pas sur le .venv du depot. Les deux
REM sont complementaires, et un seul peut faire tourner le studio ENTIER :
REM
REM   .venv           fastapi uvicorn pydantic PIL numpy psutil
REM                   ... mais ni torch, ni insightface, ni cv2
REM   python_embeded  torch insightface cv2 pydantic PIL numpy psutil
REM                   ... plus fastapi et uvicorn, installes le 30/08/2026
REM
REM Lance depuis le .venv, le serveur demarre et /docs repond — mais le QC
REM d'identite leve « No module named 'cv2' » des qu'on mesure ou qu'on produit.
REM Le studio serait consultable, pas productif. Le .venv reste ce pour quoi il
REM a ete cree : faire tourner les tests (voir requirements.txt).
REM
REM Les deux paquets manquants s'installent une seule fois :
REM   "%COMFYUI_PYTHON%" -m pip install fastapi uvicorn[standard]
REM Le lanceur le verifie au demarrage et le dit plutot que d'echouer sur une
REM trace d'import a l'ecran.
REM
REM MONO-WORKER : c'est app.py qui passe l'objet application a uvicorn.run, ce
REM qui rend --workers indisponible (STATE, UNDO et le QC en cache sont des
REM globales de process). Ne pas contourner en lancant `uvicorn` en ligne de
REM commande depuis ce fichier — ce serait exactement le contournement.
setlocal

REM .env d'abord : ses variables doivent etre dans l'environnement AVANT que
REM quoi que ce soit demarre, ComfyUI compris.
call "%~dp0load_env.bat"
if errorlevel 1 (
    pause
    exit /b 1
)

call "%~dp0find_python.bat"
if errorlevel 1 (
    pause
    exit /b 1
)

REM Prerequis du serveur. Sans ce controle, l'absence de fastapi sort en
REM ModuleNotFoundError dans une fenetre qui se referme, et il n'y a rien a lire.
"%COMFYUI_PYTHON%" -c "import fastapi, uvicorn" 2>nul
if errorlevel 1 (
    echo ERREUR : fastapi et/ou uvicorn manquent dans l'interpreteur de ComfyUI.
    echo.
    echo   %COMFYUI_PYTHON%
    echo.
    echo Les installer une fois pour toutes :
    echo   "%COMFYUI_PYTHON%" -m pip install fastapi uvicorn[standard]
    echo.
    pause
    exit /b 1
)

"%COMFYUI_PYTHON%" "%~dp0web\app.py" %*
pause
