#!/usr/bin/env bash
# Met à jour l'application Parc IT sur le VPS :
#   1. sauvegarde de la base (si elle tourne)
#   2. récupération de la branche main depuis GitHub
#   3. reconstruction et redémarrage des conteneurs
# Usage (depuis n'importe où) : ./deploiement/deployer.sh
set -euo pipefail

DOSSIER_APP="$(cd "$(dirname "$0")/.." && pwd)"
DOSSIER_SAUVEGARDES="${DOSSIER_SAUVEGARDES:-$HOME/sauvegardes-parc-it}"
NB_SAUVEGARDES=14   # nombre de sauvegardes conservées

cd "$DOSSIER_APP"

if [ ! -f .env ]; then
  echo "ERREUR : fichier .env absent dans $DOSSIER_APP (voir deploiement/env.vps.exemple)." >&2
  exit 1
fi

# ---------- 1. Sauvegarde ----------
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  mkdir -p "$DOSSIER_SAUVEGARDES"
  fichier="$DOSSIER_SAUVEGARDES/inventaire-$(date +%Y%m%d-%H%M%S).dump"
  echo "Sauvegarde de la base → $fichier"
  docker compose exec -T db pg_dump -U inventaire_app -d inventaire -Fc > "$fichier"
  # Ne garder que les plus récentes
  ls -1t "$DOSSIER_SAUVEGARDES"/inventaire-*.dump | tail -n +$((NB_SAUVEGARDES + 1)) | xargs -r rm --
else
  echo "Base non démarrée : pas de sauvegarde (première installation ?)."
fi

# ---------- 2. Code ----------
echo "Récupération de la branche main…"
git fetch origin
git checkout main
git pull --ff-only origin main

# ---------- 3. Conteneurs ----------
echo "Reconstruction et redémarrage…"
docker compose up -d --build
docker image prune -f >/dev/null

docker compose ps
echo "Mise à jour terminée."
