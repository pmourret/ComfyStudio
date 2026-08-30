@echo off
REM Charge .env (racine du repo) dans l'environnement de l'appelant.
REM Ne pas appeler directement :
REM   call "%~dp0load_env.bat"
REM   if errorlevel 1 exit /b 1
REM
REM POURQUOI CE FICHIER. Cote Python, AUTOMATION/env_config.py sait deja lire
REM .env tout seul, avec la priorite « variable d'environnement du processus,
REM puis .env ». Ce lanceur ne remplace donc rien : il POSE les memes valeurs
REM dans l'environnement du process, ce qui les rend visibles a tout code qui
REM lit os.environ directement, sans passer par env_config. Les valeurs etant
REM identiques, la priorite d'env_config n'en est pas changee — elle trouve la
REM meme chose, une etape plus tot.
REM
REM Aucune dependance ajoutee : pas de python-dotenv. Le mecanisme maison
REM existait avant la migration FastAPI (ADR-0008), il reste la seule source.
REM
REM Meme facon de lire que find_python.bat : `eol=#` ignore les commentaires,
REM `delims==` coupe sur le premier `=`, donc une valeur peut en contenir.
REM Pas de setlocal : c'est justement l'environnement de l'appelant qu'on
REM remplit. run_web.bat ouvre son propre setlocal, la portee est donc bornee
REM a la duree du lanceur.

set "ENVFILE=%~dp0..\.env"
if not exist "%ENVFILE%" (
    echo ERREUR : %ENVFILE% introuvable.
    echo Copier .env.example vers .env a la racine du repo et renseigner COMFYUI_ROOT.
    exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENVFILE%") do (
    if not "%%~A"=="" set "%%~A=%%~B"
)
exit /b 0
