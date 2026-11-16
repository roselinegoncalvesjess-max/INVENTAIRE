@echo off
rem Demarre l'application d'inventaire en mode reseau (production)
rem  1. PostgreSQL (C:\pgsql, port 5433) s'il n'est pas deja lance
rem  2. Compilation de l'interface (client\dist)
rem  3. Serveur Node.js sur le port 3001, accessible depuis le reseau
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo === 1/3 PostgreSQL ===
"C:\pgsql\bin\pg_ctl.exe" -D "C:\pgsql\data" status >nul 2>&1
if errorlevel 1 (
  echo Demarrage de PostgreSQL sur le port 5433...
  "C:\pgsql\bin\pg_ctl.exe" -D "C:\pgsql\data" -o "-p 5433" -l "C:\pgsql\logfile.txt" -w start
  if errorlevel 1 ( echo ERREUR : PostgreSQL ne demarre pas. Voir C:\pgsql\logfile.txt & pause & exit /b 1 )
) else (
  echo PostgreSQL est deja lance.
)

echo.
echo === 2/3 Compilation de l'interface ===
pushd client
call npm.cmd run build --silent
if errorlevel 1 ( echo ERREUR : la compilation de l'interface a echoue. & popd & pause & exit /b 1 )
popd

echo.
echo === 3/3 Serveur ===
echo Laissez cette fenetre ouverte : la fermer arrete l'application.
echo.
cd server
node src\index.js
pause
