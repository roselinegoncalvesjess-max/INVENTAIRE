-- Schéma de la base PostgreSQL « inventaire »
-- Exécuté automatiquement au démarrage du serveur (sans effet si les tables existent déjà).

CREATE TABLE IF NOT EXISTS decharges (
    id                      SERIAL PRIMARY KEY,
    numero                  VARCHAR(20)  NOT NULL UNIQUE,      -- DCH-2026-0001
    date_remise             DATE         NOT NULL,
    structure               VARCHAR(200) NOT NULL,             -- structure bénéficiaire
    beneficiaire_nom        VARCHAR(150) NOT NULL,
    beneficiaire_telephone  VARCHAR(30),
    beneficiaire_fonction   VARCHAR(150),
    cree_le                 TIMESTAMPTZ  NOT NULL DEFAULT now(),
    modifie_le              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
    id             SERIAL PRIMARY KEY,
    decharge_id    INTEGER      NOT NULL REFERENCES decharges(id) ON DELETE CASCADE,
    designation    VARCHAR(200) NOT NULL,
    quantite       INTEGER      NOT NULL DEFAULT 1 CHECK (quantite > 0),
    identifiant    VARCHAR(100),
    imei           VARCHAR(15),
    numero_serie   VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_articles_decharge ON articles(decharge_id);
CREATE INDEX IF NOT EXISTS idx_articles_imei     ON articles(imei);
CREATE INDEX IF NOT EXISTS idx_articles_serie    ON articles(numero_serie);
CREATE INDEX IF NOT EXISTS idx_decharges_struct  ON decharges(structure);

-- ---------- Registre du parc (importé depuis « fichier excel/Base inventaire.xlsx ») ----------

CREATE TABLE IF NOT EXISTS equipements (
    id                         SERIAL PRIMARY KEY,
    num_ordre                  INTEGER,                 -- N° Ord (Excel)
    numero_compte              VARCHAR(20),             -- 24420000, 24510000…
    type                       VARCHAR(100),            -- Matériel informatique, Matériel de transport, Licences
    categorie                  VARCHAR(100),            -- Tablettes, Ordinateur Portable…
    numero_fiche               VARCHAR(60),             -- BS-MAT.INFO LHSPLA 00001
    identifiant                VARCHAR(60),             -- colonne « ID »
    descriptif                 VARCHAR(300),
    reference_serie            VARCHAR(150),            -- Références / Série / IMEI
    accessoires                VARCHAR(200),            -- Consommables / Accessoires
    valeur_acquisition         NUMERIC(14,2),
    date_debut                 DATE,
    date_fin                   DATE,
    duree                      INTEGER,                 -- années
    taux                       NUMERIC(6,2),            -- en %
    cumul_debut                NUMERIC(14,2),
    dotation                   NUMERIC(14,2),           -- Dotation expl. au 31/12/2024
    cumul_fin                  NUMERIC(14,2),
    valeur_nette               NUMERIC(14,2),           -- Valeur nette au 31/12/2024
    utilisateur                VARCHAR(150),            -- Utilisateur principal
    site                       VARCHAR(120),
    direction                  VARCHAR(200),            -- Direction / Service
    emplacement                VARCHAR(150),
    statut                     VARCHAR(40),             -- En service, Inactif…
    observation                VARCHAR(300),            -- « Colonne1 » : volé, défaillant…
    nouvel_utilisateur         VARCHAR(150),
    date_nouvelle_attribution  DATE,
    -- Dernier inventaire physique
    inventorie_le              DATE,
    inventorie_par             VARCHAR(150),
    constat                    VARCHAR(30),             -- Présent, Absent, Volé ou perdu
    etat_physique              VARCHAR(30),             -- Bon état, Usagé, Défaillant, Hors d'usage
    -- Traçabilité de l'import
    ligne_excel                INTEGER,
    anomalie_import            TEXT,
    cree_le                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historique : un relevé par passage lors d'un inventaire physique
CREATE TABLE IF NOT EXISTS releves_inventaire (
    id              SERIAL PRIMARY KEY,
    equipement_id   INTEGER      NOT NULL REFERENCES equipements(id) ON DELETE CASCADE,
    date_releve     DATE         NOT NULL,
    agent           VARCHAR(150) NOT NULL,
    constat         VARCHAR(30)  NOT NULL,
    etat_physique   VARCHAR(30),
    commentaire     TEXT,
    modifications   JSONB        NOT NULL DEFAULT '{}',  -- { champ: { avant, apres } }
    cree_le         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equip_fiche    ON equipements(numero_fiche);
CREATE INDEX IF NOT EXISTS idx_equip_serie    ON equipements(reference_serie);
CREATE INDEX IF NOT EXISTS idx_equip_site     ON equipements(site);
CREATE INDEX IF NOT EXISTS idx_releves_equip  ON releves_inventaire(equipement_id);

-- ---------- Comptes et connexions ----------

CREATE TABLE IF NOT EXISTS utilisateurs (
    id                   SERIAL PRIMARY KEY,
    identifiant          VARCHAR(60)  NOT NULL UNIQUE,        -- en minuscules
    nom                  VARCHAR(150) NOT NULL,               -- nom affiché (ex. agent d'inventaire)
    role                 VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'agent', 'lecteur')),
    mot_de_passe         TEXT         NOT NULL,               -- scrypt : sel$empreinte
    doit_changer         BOOLEAN      NOT NULL DEFAULT false, -- mot de passe provisoire à changer
    actif                BOOLEAN      NOT NULL DEFAULT true,
    derniere_connexion   TIMESTAMPTZ,
    cree_le              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    jeton           CHAR(64)     PRIMARY KEY,                 -- empreinte SHA-256 du cookie
    utilisateur_id  INTEGER      NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    expire_le       TIMESTAMPTZ  NOT NULL,
    cree_le         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_utilisateur ON sessions(utilisateur_id);

-- Traçabilité : qui a saisi quoi
ALTER TABLE releves_inventaire ADD COLUMN IF NOT EXISTS utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE decharges          ADD COLUMN IF NOT EXISTS cree_par       VARCHAR(150);
