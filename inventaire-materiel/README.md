# Inventaire du matériel informatique

Application web de gestion du parc : décharges de remise de matériel et **inventaire physique**
du registre importé depuis `fichier excel/Base inventaire.xlsx`.

## Technologies

| Couche | Technologie | Rôle |
|---|---|---|
| Base de données | **PostgreSQL** | Tables `decharges` et `articles` |
| Serveur | **Node.js** + **Express** + `pg` | API REST, validation, numérotation, export CSV |
| Interface | **React 18** + **Vite** | Saisie, recherche, inventaire, fiches |

## Prérequis

- **Node.js 18 ou plus récent** : https://nodejs.org
- **PostgreSQL 14 ou plus récent** : https://www.postgresql.org/download/ (pgAdmin est installé avec)
- **Visual Studio Code** (recommandé) ou Visual Studio 2022

## Installation

### 1. Créer la base de données

Dans pgAdmin (ou psql) :

```sql
CREATE DATABASE inventaire;
```

Les tables sont créées automatiquement au premier démarrage du serveur
(script `server/src/schema.sql`).

### 2. Configurer et lancer le serveur

```bash
cd server
copy .env.example .env        # sous Linux/Mac : cp .env.example .env
```

Ouvrir `server/.env` et renseigner le mot de passe PostgreSQL, puis :

```bash
npm install
npm run dev
```

Le terminal affiche : `API inventaire : http://localhost:3001/api/decharges`

### 2 bis. Importer le registre du parc (fichier Excel)

Dans le dossier `server` (une seule fois) :

```bash
npm run import
```

Le script lit `fichier excel/Base inventaire.xlsx` (feuille 1, colonnes repérées par leur en-tête),
harmonise les valeurs (« Materiel informatique » → « Matériel informatique », « WIFI POCKET » → « Wifi Pocket »,
taux 0,5 → 50 %) et note les valeurs illisibles dans la colonne *anomalie_import* de l'équipement.
Il refuse de s'exécuter si le registre contient déjà des équipements, pour ne pas écraser les inventaires
saisis. Pour tout remplacer (relevés compris) : `npm run import -- --remplacer`. Autre fichier :
`npm run import -- "cheminersichier.xlsx"`.

### 3. Lancer l'interface React

Dans un **second terminal** :

```bash
cd client
npm install
npm run dev
```

Ouvrir **http://localhost:5173** dans le navigateur.

## Dans Visual Studio Code

1. Fichier › Ouvrir le dossier › `inventaire-materiel`
2. Terminal › Nouveau terminal (deux fois, un pour `server`, un pour `client`)
3. Lancer les commandes des étapes 2 et 3

## Mise en production (accès depuis tout le réseau)

```bash
cd client
npm run build                  # crée client/dist
cd ../server
npm start                      # sert l'API ET l'interface sur le port 3001
```

Les collègues ouvrent alors `http://<adresse-IP-du-serveur>:3001`.
Ouvrir le port 3001 dans le pare-feu Windows. Pour un démarrage automatique,
utiliser un gestionnaire comme PM2 (`npm install -g pm2`, puis `pm2 start src/index.js`).

## Inventaire physique (onglet « Inventaire physique »)

- Jauges : équipements inventoriés, fiches complètes, absents ou volés, reste à faire.
- Filtres : pas encore inventoriés, informations manquantes, absents ou volés, anomalies de l'import, par site et catégorie.
- Un clic sur une ligne ouvre la fiche de constat :
  1. **Constat** : date, agent (mémorisé sur le poste), Présent / Absent / Volé ou perdu, état physique, commentaire ;
  2. **Identification**, 3. **Affectation**, 4. **Acquisition** : les champs manquants sont surlignés « à compléter ».
- « Enregistrer et suivant » passe à l'équipement suivant de la liste filtrée.
- Chaque enregistrement crée un relevé dans l'historique, avec les valeurs avant/après des champs complétés.
- « + Équipement non répertorié » ajoute un matériel trouvé sur place mais absent du fichier Excel.
- « Exporter CSV » télécharge le registre complété, à ouvrir dans Excel.

Informations considérées comme manquantes : N° de fiche, N° de série, valeur d'acquisition (vide ou 0),
date d'acquisition, utilisateur, site, direction, emplacement, statut.

## Exécution dans Docker (mode actuel)

L'application tourne dans deux conteneurs (`docker-compose.yml`) : **db** (PostgreSQL 17, données dans
le volume Docker `parc-it_donnees`, aucun port publié) et **app** (image construite par le `Dockerfile` :
interface compilée + serveur Node.js, port **3001** publié). Ils redémarrent seuls avec Docker Desktop.

- **Démarrer / mettre à jour** : double-cliquer sur `demarrer.cmd`, ou `docker compose up -d --build`.
- **État et journal** : `docker compose ps`, `docker compose logs -f app`.
- **Arrêter** : `docker compose down` (les données restent dans le volume ; `down -v` les EFFACE).
- **Mot de passe de la base** : fichier `.env` à la racine (`PGPASSWORD`, généré aléatoirement, à ne pas
  partager). Le changer après la première initialisation du volume ne change pas celui de la base.
- **Sauvegarde** :
  `docker compose exec -T db pg_dump -U inventaire_app -d inventaire -Fc > sauvegarde.dump`
- **Restauration** (base vide) :
  `docker compose cp sauvegarde.dump db:/tmp/s.dump` puis
  `docker compose exec -T db pg_restore -U inventaire_app -d inventaire --clean --if-exists --no-owner /tmp/s.dump`
- **Import Excel** (installation neuve) : `docker compose exec app npm run import`.
- **Premier administrateur** (installation neuve) : `docker compose exec app node src/creer-admin.js`.
  Sous Docker, la page « Créer le compte administrateur » n'est pas proposée (le poste n'est pas vu comme local).
- La ligne « sur le réseau : http://172.x… » du journal est l'adresse interne du conteneur : les collègues
  utilisent l'adresse IP du PC (`ipconfig`), par exemple `http://172.16.1.132:3001`.
- `demarrer-sans-docker.cmd` relance l'ancienne installation (PostgreSQL `C:\pgsql`) : ne pas l'utiliser en
  même temps que Docker (même port 3001, et deux bases différentes).
## Accès en réseau (collègues) et comptes

### Démarrer l'application pour le réseau
Sans Docker : double-cliquer sur **`demarrer-sans-docker.cmd`**. Il démarre PostgreSQL (port 5433) si besoin,
compile l'interface puis lance le serveur sur le port **3001**. La fenêtre affiche les adresses à donner
aux collègues, par exemple `http://192.168.0.183:3001`. **Laisser la fenêtre ouverte** et le PC allumé
(sans mise en veille) : la fermer arrête l'application.

### Autoriser le port 3001 dans le pare-feu (une seule fois, administrateur)
Dans PowerShell lancé **en tant qu'administrateur** (ou par le service informatique) :

```powershell
New-NetFirewallRule -DisplayName "Inventaire Parc IT (3001)" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Domain,Private,Public -RemoteAddress LocalSubnet
```

La règle n'autorise que les postes du même réseau local (`LocalSubnet`). Avec le VPN FortiClient, il peut
falloir remplacer `LocalSubnet` par la plage d'adresses du VPN.

### Comptes
- **Premier compte administrateur** : sur le PC qui héberge l'application, ouvrir `http://localhost:3001`.
  La page propose de créer l'administrateur (impossible depuis un autre poste).
- L'administrateur crée les autres comptes dans **Administration › Utilisateurs**. Un mot de passe
  provisoire est affiché une seule fois ; la personne doit le changer à sa première connexion.
- Rôles : **Administrateur** (tout, dont les comptes), **Agent d'inventaire** (constats, décharges),
  **Lecture seule** (consultation et exports).
- Les constats et décharges sont enregistrés au nom du compte connecté.
- Sécurité : mots de passe hachés (scrypt), session par cookie HttpOnly de 12 h, blocage 15 min après
  8 essais erronés, un compte désactivé est déconnecté immédiatement.
- Mot de passe oublié : un administrateur clique sur « Réinitialiser le mot de passe ».

Le trafic circule en HTTP sur le réseau local (non chiffré). Pour un accès hors du bureau ou chiffré,
prévoir HTTPS (certificat) ou un hébergement dédié.

## Structure du projet

```
inventaire-materiel/
├── server/                         API Node.js
│   ├── .env.example                Paramètres de connexion PostgreSQL
│   ├── package.json
│   └── src/
│       ├── index.js                Démarrage du serveur Express
│       ├── db.js                   Connexion PostgreSQL (pool) et transactions
│       ├── schema.sql              Création des tables
│       ├── validation.js           Contrôle des champs, de l'IMEI et des relevés d'inventaire
│       ├── importer-excel.js       Import du fichier Excel du parc (npm run import)
│       ├── auth.js                 Comptes, mots de passe, sessions, droits
│       └── routes/
│           ├── decharges.js        Décharges + exports CSV
│           ├── equipements.js      Registre du parc et inventaire physique
│           └── utilisateurs.js     Gestion des comptes (administrateurs)
└── client/                         Interface React
    ├── index.html
    ├── vite.config.js              Redirection /api vers le serveur
    └── src/
        ├── main.jsx                Point d'entrée
        ├── App.jsx                 Menu latéral, barre haute, navigation, état global
        ├── api.js                  Appels au serveur
        ├── utils.js                Dates, recherche, IMEI, doublons
        ├── styles.css
        └── components/
            ├── TableauDeBord.jsx       Indicateurs, graphiques, priorités
            ├── Equipements.jsx         Liste du parc (filtres, pagination)
            ├── FicheEquipement.jsx     Fiche détail d'un équipement
            ├── Historique.jsx          Tous les mouvements (constats, remises)
            ├── Graphiques.jsx          Histogramme, anneau, barres (SVG, sans dépendance)
            ├── Icone.jsx               Icônes au trait
            ├── ListeDecharges.jsx      Liste des décharges
            ├── Inventaire.jsx          Un équipement par ligne
            ├── FormulaireDecharge.jsx  Saisie et modification
            ├── FicheDecharge.jsx       Détail, modification, suppression
            ├── InventairePhysique.jsx  Registre du parc, jauges et filtres
            ├── FicheInventaire.jsx     Constat et saisie des informations manquantes
            └── Commun.jsx              Barre de recherche, état vide
```

## API

| Méthode | Adresse | Action |
|---|---|---|
| GET | `/api/decharges` | Liste des décharges avec leur matériel |
| GET | `/api/decharges/:id` | Une décharge |
| POST | `/api/decharges` | Créer (n° DCH-AAAA-0001 attribué par le serveur) |
| PUT | `/api/decharges/:id` | Modifier |
| DELETE | `/api/decharges/:id` | Supprimer |
| GET | `/api/decharges/export/inventaire` | CSV de tout le matériel |
| GET | `/api/decharges/export/decharges` | CSV des décharges |
| GET | `/api/equipements` | Registre du parc |
| PUT | `/api/equipements/:id/inventaire` | Constat physique + champs complétés |
| GET | `/api/equipements/releves` | Tous les relevés d'inventaire (page Historique) |
| GET | `/api/equipements/:id/releves` | Historique des inventaires d'un équipement |
| POST | `/api/equipements` | Équipement trouvé hors registre |
| GET | `/api/equipements/export` | CSV du registre avec le résultat de l'inventaire |

## Modèle de données

```
decharges                         articles
──────────────────────────        ──────────────────────────
id (PK)                    ◄───── decharge_id (FK, cascade)
numero (unique)                   id (PK)
date_remise                       designation
structure                         quantite
beneficiaire_nom                  identifiant
beneficiaire_telephone            imei
beneficiaire_fonction             numero_serie
cree_le, modifie_le

equipements (colonnes du fichier Excel        releves_inventaire
+ dernier inventaire)                         ──────────────────────────
──────────────────────────                    id (PK)
id (PK)                            ◄───────── equipement_id (FK, cascade)
num_ordre, numero_compte, type,               date_releve, agent
categorie, numero_fiche, identifiant,         constat, etat_physique
descriptif, reference_serie, …                commentaire
utilisateur, site, direction,                 modifications (JSON avant/après)
emplacement, statut, observation
inventorie_le, inventorie_par,
constat, etat_physique, anomalie_import
```

## Réattribution des appareils

Chaque appareil garde la liste de ses **détenteurs successifs** (table `attributions`, une ligne par période, `en_cours` = détenteur actuel, `detenteur` vide = en stock). La colonne `equipements.utilisateur` contient toujours le détenteur actuel.

- Fiche équipement → bouton **Réattribuer** (admin et agent) : motif, date, nouveau détenteur, direction, site, emplacement. Le motif « Retour en stock » libère l'appareil. Une case propose de préparer ensuite la **décharge** pré-remplie.
- Un utilisateur différent saisi lors d'un **constat d'inventaire** ouvre aussi une nouvelle période (motif « Constaté lors de l'inventaire »).
- Liste : badge « Réattribué », filtre « Réattribués uniquement », recherche par ancien détenteur. Historique : type « Réattribution ». Export CSV : détenteur actuel, depuis, précédent, anciens.
- Reprise automatique au démarrage : l'« Utilisateur » de l'Excel devient la première période ; un « Nouvel utilisateur » qui contient des lettres devient le détenteur actuel (la valeur « 225 » de la ligne N° Ord 33 est ignorée).

## Bénéficiaires : personnel, services, structures sanitaires

Chaque équipement a un **type de bénéficiaire** (`equipements.type_beneficiaire`) : `personnel`, `service` (service ou lieu de la NPSP), `site`, `district`, `region` (structures sanitaires) ou `non_affecte`. Les structures sanitaires forment un référentiel `structures_sanitaires` (région → district → site, avec responsable et téléphone) ; `structure_id` relie l'équipement à sa structure.

- **Reprise automatique** (au démarrage, pour les équipements non classés) : `server/src/classement.js` propose un type à partir de l'utilisateur, du site et de la direction (« DS AGBOVILLE/CSR N'CHOMPO/PHARMACIE » → site CSR N'CHOMPO du district DS AGBOVILLE) et crée les districts et sites trouvés. Chaque proposition reste **à valider** (`classement_valide = false`, raison dans `classement_raison`).
- Page **À classer** (admin, agent) : valider les propositions en lot ou les corriger, regrouper les **noms écrits de plusieurs façons** (ex. « LOUKOU N'Goran » / « LOUKOU N'GORAN »), gérer la pyramide sanitaire (les régions sont à créer, puis y rattacher les districts).
- **Réattribuer** : on choisit d'abord le type ; pour une structure, on la choisit dans le référentiel (ou on la crée) et on peut noter la personne qui reçoit. Un détenteur changé lors d'un inventaire remet le classement « à valider ».
- Liste : filtres Bénéficiaire et District sanitaire. Tableau de bord : répartition par bénéficiaire (nombre et valeur) et matériel remis par district. Export CSV : type, région, district, site sanitaire, classement validé.
