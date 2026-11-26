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

-- ---------- Détenteurs successifs (réattributions) ----------
-- Une ligne par période de détention ; « en_cours » = détenteur actuel (au plus une par équipement).
-- detenteur NULL = appareil rendu, en stock.
CREATE TABLE IF NOT EXISTS attributions (
    id              SERIAL PRIMARY KEY,
    equipement_id   INTEGER      NOT NULL REFERENCES equipements(id) ON DELETE CASCADE,
    detenteur       VARCHAR(150),
    direction       VARCHAR(200),
    site            VARCHAR(120),
    emplacement     VARCHAR(150),
    du              DATE,
    au              DATE,
    en_cours        BOOLEAN      NOT NULL DEFAULT true,
    motif           VARCHAR(80),
    commentaire     TEXT,
    origine         VARCHAR(20)  NOT NULL DEFAULT 'saisie',   -- import | saisie | inventaire
    saisi_par       VARCHAR(150),
    utilisateur_id  INTEGER      REFERENCES utilisateurs(id) ON DELETE SET NULL,
    cree_le         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attrib_equip ON attributions(equipement_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attrib_en_cours ON attributions(equipement_id) WHERE en_cours;

-- Reprise du registre (une seule fois par équipement) : l'« Utilisateur » de l'Excel devient la
-- première attribution ; un « Nouvel utilisateur » (contenant des lettres) clôt celle-ci et devient le détenteur actuel.
WITH cand AS (
    SELECT e.*, (COALESCE(e.nouvel_utilisateur, '') ~ '[[:alpha:]]') AS reattribue
      FROM equipements e
     WHERE NOT EXISTS (SELECT 1 FROM attributions a WHERE a.equipement_id = e.id)
       AND (COALESCE(btrim(e.utilisateur), '') <> '' OR COALESCE(e.nouvel_utilisateur, '') ~ '[[:alpha:]]')
), ajout AS (
    -- Un seul INSERT trié : l'ancien détenteur reçoit un identifiant plus petit que le nouveau (ordre chronologique)
    INSERT INTO attributions (equipement_id, detenteur, direction, site, emplacement, du, au, en_cours, origine, motif)
    SELECT equipement_id, detenteur, direction, site, emplacement, du, au, en_cours, 'import', motif
      FROM (
        SELECT id AS equipement_id, 1 AS rang, btrim(utilisateur) AS detenteur, direction, site, emplacement,
               date_debut AS du, CASE WHEN reattribue THEN date_nouvelle_attribution END AS au,
               NOT reattribue AS en_cours, 'Fichier Excel' AS motif
          FROM cand WHERE COALESCE(btrim(utilisateur), '') <> ''
        UNION ALL
        SELECT id, 2, btrim(nouvel_utilisateur), direction, site, emplacement,
               date_nouvelle_attribution, NULL, true, 'Fichier Excel (nouvel utilisateur)'
          FROM cand WHERE reattribue
      ) t
     ORDER BY equipement_id, rang
)
UPDATE equipements e SET utilisateur = btrim(c.nouvel_utilisateur)
  FROM cand c WHERE e.id = c.id AND c.reattribue;

-- ---------- Bénéficiaires : personnel, services NPSP, structures sanitaires ----------
-- Pyramide sanitaire : région → district → site (centre de santé)
CREATE TABLE IF NOT EXISTS structures_sanitaires (
    id           SERIAL PRIMARY KEY,
    niveau       VARCHAR(10)  NOT NULL CHECK (niveau IN ('region', 'district', 'site')),
    nom          VARCHAR(150) NOT NULL,
    parent_id    INTEGER      REFERENCES structures_sanitaires(id) ON DELETE SET NULL,
    responsable  VARCHAR(150),
    telephone    VARCHAR(40),
    cree_le      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_structure_nom ON structures_sanitaires(niveau, upper(nom));

-- Type de bénéficiaire : personnel | service | site | district | region | non_affecte
ALTER TABLE equipements  ADD COLUMN IF NOT EXISTS type_beneficiaire VARCHAR(20);
ALTER TABLE equipements  ADD COLUMN IF NOT EXISTS structure_id      INTEGER REFERENCES structures_sanitaires(id) ON DELETE SET NULL;
ALTER TABLE equipements  ADD COLUMN IF NOT EXISTS classement_valide BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE equipements  ADD COLUMN IF NOT EXISTS classement_raison TEXT;
ALTER TABLE attributions ADD COLUMN IF NOT EXISTS type_beneficiaire VARCHAR(20);
ALTER TABLE attributions ADD COLUMN IF NOT EXISTS structure_id      INTEGER REFERENCES structures_sanitaires(id) ON DELETE SET NULL;
ALTER TABLE attributions ADD COLUMN IF NOT EXISTS recu_par          VARCHAR(150);   -- personne qui reçoit pour une structure

-- ---------- Mouvements : tout ce qui arrive à un équipement en dehors de l'inventaire ----------
-- déplacement, réparation, prêt, panne, perte/vol, remise en service, réforme, correction de fiche.
-- Les changements de détenteur restent dans « attributions ».
-- Une sortie (prêt, réparation) reste ouverte tant que clos_le est vide.
CREATE TABLE IF NOT EXISTS mouvements (
    id              SERIAL PRIMARY KEY,
    equipement_id   INTEGER      NOT NULL REFERENCES equipements(id) ON DELETE CASCADE,
    type            VARCHAR(30)  NOT NULL,
    date_mouvement  DATE         NOT NULL,
    destinataire    VARCHAR(150),                         -- emprunteur, prestataire de réparation
    retour_prevu    DATE,
    clos_le         DATE,
    clos_par_id     INTEGER      REFERENCES mouvements(id) ON DELETE SET NULL,
    motif           VARCHAR(150),
    commentaire     TEXT,
    piece           VARCHAR(120),                         -- n° de décharge, PV, bon de sortie…
    modifications   JSONB        NOT NULL DEFAULT '{}',   -- { champ: { avant, apres } }
    saisi_par       VARCHAR(150),
    utilisateur_id  INTEGER      REFERENCES utilisateurs(id) ON DELETE SET NULL,
    cree_le         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mouv_equip ON mouvements(equipement_id);
CREATE INDEX IF NOT EXISTS idx_mouv_ouverts ON mouvements(equipement_id) WHERE clos_le IS NULL AND type IN ('pret', 'reparation');

-- ---------- Journal automatique : toute modification d'une fiche équipement ----------
-- Rempli par un déclencheur : aucune modification ne peut lui échapper, quel que soit l'écran.
-- L'auteur et l'origine sont transmis par le serveur (set_config dans la transaction).
CREATE TABLE IF NOT EXISTS journal_modifications (
    id              SERIAL PRIMARY KEY,
    equipement_id   INTEGER      NOT NULL REFERENCES equipements(id) ON DELETE CASCADE,
    modifications   JSONB        NOT NULL,                -- { colonne: { avant, apres } }
    source          VARCHAR(30),                          -- inventaire | reattribution | mouvement | classement | fusion
    auteur          VARCHAR(150),
    utilisateur_id  INTEGER      REFERENCES utilisateurs(id) ON DELETE SET NULL,
    cree_le         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journal_equip ON journal_modifications(equipement_id);

CREATE OR REPLACE FUNCTION journaliser_equipement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    avant jsonb := to_jsonb(OLD);
    apres jsonb := to_jsonb(NEW);
    diff  jsonb := '{}';
    k     text;
BEGIN
    FOR k IN SELECT jsonb_object_keys(apres) LOOP
        CONTINUE WHEN k IN ('modifie_le', 'cree_le', 'inventorie_le', 'inventorie_par', 'constat',
                            'classement_raison', 'classement_valide');
        IF avant -> k IS DISTINCT FROM apres -> k THEN
            diff := diff || jsonb_build_object(k, jsonb_build_object('avant', avant -> k, 'apres', apres -> k));
        END IF;
    END LOOP;
    IF diff <> '{}' THEN
        INSERT INTO journal_modifications (equipement_id, modifications, source, auteur, utilisateur_id)
        VALUES (NEW.id, diff,
                NULLIF(current_setting('parcit.source', true), ''),
                NULLIF(current_setting('parcit.auteur', true), ''),
                NULLIF(current_setting('parcit.utilisateur_id', true), '')::int);
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_journal_equipement ON equipements;
CREATE TRIGGER trg_journal_equipement AFTER UPDATE ON equipements
    FOR EACH ROW EXECUTE FUNCTION journaliser_equipement();

-- ---------- Décharges reliées aux équipements du parc ----------
-- À la création de la colonne (une seule fois) : rattachement automatique des lignes déjà saisies
-- quand l'IMEI, le n° de série ou l'identifiant désigne un seul équipement du registre.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'articles' AND column_name = 'equipement_id') THEN
        ALTER TABLE articles ADD COLUMN equipement_id INTEGER REFERENCES equipements(id) ON DELETE SET NULL;
        UPDATE articles a SET equipement_id = m.eid
          FROM (SELECT a2.id AS aid, MIN(e.id) AS eid
                  FROM articles a2 JOIN equipements e ON
                       (a2.imei IS NOT NULL AND upper(btrim(e.reference_serie)) = a2.imei)
                    OR (btrim(COALESCE(a2.numero_serie, '')) <> '' AND upper(btrim(e.reference_serie)) = upper(btrim(a2.numero_serie)))
                    OR (btrim(COALESCE(a2.identifiant, '')) <> '' AND (upper(btrim(e.numero_fiche)) = upper(btrim(a2.identifiant))
                                                                   OR upper(btrim(e.identifiant)) = upper(btrim(a2.identifiant))))
                 GROUP BY a2.id HAVING COUNT(DISTINCT e.id) = 1) m
         WHERE a.id = m.aid;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_articles_equip ON articles(equipement_id);
