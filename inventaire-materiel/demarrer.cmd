@echo off
rem Demarre l'application Parc IT dans Docker (base PostgreSQL + serveur)
rem Les conteneurs redemarrent ensuite seuls avec Docker Desktop.
chcp 65001 >nul
setlocal
cd /d "%~dp0"

docker info >nul 2>&1
if errorlevel 1 (
  echo Demarrage de Docker Desktop...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  for /l %%i in (1,1,60) do (
    timeout /t 3 /nobreak >nul
    docker info >nul 2>&1 && goto docker_pret
  )
  echo ERREUR : Docker Desktop ne repond pas. & pause & exit /b 1
)
:docker_pret

echo Construction et demarrage des conteneurs...
docker compose up -d --build
if errorlevel 1 ( echo ERREUR : voir les messages ci-dessus. & pause & exit /b 1 )

echo.
docker compose ps
echo.
echo Application : http://127.0.0.1:3001  (localhost peut etre capte par WSL sur ce poste)
echo Pour les collegues : http://ADRESSE-IP-DU-PC:3001  (commande ipconfig pour l'adresse)
echo Vous pouvez fermer cette fenetre : l'application continue de tourner.
pause
