import { Router } from "express";
import { pool, transaction } from "../db.js";
import { CHAMPS_EQUIPEMENT, validerReleve } from "../validation.js";

const router = Router();

// Colonnes SQL → noms utilisés par l'interface
const COLONNES = {
  id: "id", numOrdre: "num_ordre", numeroCompte: "numero_compte", type: "type", categorie: "categorie",
  numeroFiche: "numero_fiche", identifiant: "identifiant", descriptif: "descriptif",
  referenceSerie: "reference_serie", accessoires: "accessoires", valeurAcquisition: "valeur_acquisition",
  dateDebut: "date_debut", dateFin: "date_fin", duree: "duree", taux: "taux", cumulDebut: "cumul_debut",
  dotation: "dotation", cumulFin: "cumul_fin", valeurNette: "valeur_nette", utilisateur: "utilisateur",
  site: "site", direction: "direction", emplacement: "emplacement", statut: "statut", observation: "observation",
  nouvelUtilisateur: "nouvel_utilisateur", dateNouvelleAttribution: "date_nouvelle_attribution",
  inventorieLe: "inventorie_le", inventoriePar: "inventorie_par", constat: "constat", etatPhysique: "etat_physique",
  ligneExcel: "ligne_excel", anomalieImport: "anomalie_import", modifieLe: "modifie_le"
};
const SELECT = `SELECT ${Object.entries(COLONNES).map(([k, c]) => `e.${c} AS "${k}"`).join(", ")},
       (SELECT COUNT(*)::int FROM releves_inventaire r WHERE r.equipement_id = e.id) AS "nbReleves"
  FROM equipements e`;

const lire = async (db, id) => (await db.query(`${SELECT} WHERE e.id = $1`, [id])).rows[0] ?? null;

// Enregistre le relevé et applique les champs complétés ; renvoie false si l'équipement n'existe pas
async function appliquerReleve(client, id, { releve, champs }, utilisateurId = null) {
  const { rows } = await client.query("SELECT * FROM equipements WHERE id = $1 FOR UPDATE", [id]);
  if (!rows.length) return false;
  const avant = rows[0];

  const sets = [], valeurs = [id], modifications = {};
  for (const [cle, val] of Object.entries(champs)) {
    const col = CHAMPS_EQUIPEMENT[cle][0];
    if ((avant[col] ?? null) === (val ?? null)) continue;
    modifications[cle] = { avant: avant[col] ?? null, apres: val };
    valeurs.push(val);
    sets.push(`${col} = $${valeurs.length}`);
  }
  valeurs.push(releve.date, releve.agent, releve.constat, releve.etatPhysique);
  const n = valeurs.length;
  sets.push(`inventorie_le = $${n - 3}`, `inventorie_par = $${n - 2}`, `constat = $${n - 1}`,
            `etat_physique = $${n}`, "modifie_le = now()");
  await client.query(`UPDATE equipements SET ${sets.join(", ")} WHERE id = $1`, valeurs);

  await client.query(
    `INSERT INTO releves_inventaire (equipement_id, date_releve, agent, constat, etat_physique, commentaire, modifications, utilisateur_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, releve.date, releve.agent, releve.constat, releve.etatPhysique, releve.commentaire, modifications, utilisateurId]
  );
  return true;
}

// GET /api/equipements — tout le registre
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SELECT} ORDER BY e.num_ordre NULLS LAST, e.id`);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/equipements/releves — tous les relevés d'inventaire, avec l'équipement concerné
router.get("/releves", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.equipement_id AS "equipementId", r.date_releve AS "date", r.agent, r.constat,
              r.etat_physique AS "etatPhysique", r.commentaire, r.modifications, r.cree_le AS "creeLe",
              e.descriptif, e.numero_fiche AS "numeroFiche", e.categorie, e.site, e.utilisateur
         FROM releves_inventaire r JOIN equipements e ON e.id = r.equipement_id
        ORDER BY r.date_releve DESC, r.id DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/equipements/:id/releves — historique des inventaires physiques
router.get("/:id(\\d+)/releves", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, date_releve AS "date", agent, constat, etat_physique AS "etatPhysique",
              commentaire, modifications, cree_le AS "creeLe"
         FROM releves_inventaire WHERE equipement_id = $1 ORDER BY date_releve DESC, id DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// L'agent du relevé est toujours le compte connecté (traçabilité)
const avecAgent = req => ({ ...req.body, releve: { ...(req.body?.releve || {}), agent: req.utilisateur.nom } });

// PUT /api/equipements/:id/inventaire — constat physique + informations complétées
router.put("/:id(\\d+)/inventaire", async (req, res, next) => {
  const { erreur, donnees } = validerReleve(avecAgent(req));
  if (erreur) return res.status(400).json({ message: erreur });
  try {
    const trouve = await transaction(client => appliquerReleve(client, req.params.id, donnees, req.utilisateur.id));
    if (!trouve) return res.status(404).json({ message: "Équipement introuvable." });
    res.json(await lire(pool, req.params.id));
  } catch (e) { next(e); }
});

// POST /api/equipements — équipement trouvé lors de l'inventaire mais absent du registre
router.post("/", async (req, res, next) => {
  const { erreur, donnees } = validerReleve(avecAgent(req));
  if (erreur) return res.status(400).json({ message: erreur });
  if (!donnees.champs.descriptif) return res.status(400).json({ message: "Le descriptif de l'équipement est obligatoire." });
  try {
    const id = await transaction(async client => {
      const { rows } = await client.query(
        `INSERT INTO equipements (descriptif, anomalie_import)
         VALUES ($1, 'Ajouté lors de l''inventaire physique (absent du fichier Excel)') RETURNING id`,
        [donnees.champs.descriptif]
      );
      await appliquerReleve(client, rows[0].id, donnees, req.utilisateur.id);
      return rows[0].id;
    });
    res.status(201).json(await lire(pool, id));
  } catch (e) { next(e); }
});

// GET /api/equipements/export — CSV du registre avec le résultat de l'inventaire
router.get("/export", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SELECT} ORDER BY e.num_ordre NULLS LAST, e.id`);
    const dateFr = d => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
    const entetes = [
      ["N° Ord", "numOrdre"], ["N° compte", "numeroCompte"], ["Type", "type"], ["Catégorie", "categorie"],
      ["N° fiche", "numeroFiche"], ["ID", "identifiant"], ["Descriptif", "descriptif"],
      ["Références/Série/IMEI", "referenceSerie"], ["Consommables/Accessoires", "accessoires"],
      ["Valeur d'acquisition", "valeurAcquisition"], ["Date de début", "dateDebut", dateFr], ["Date de fin", "dateFin", dateFr],
      ["Durée", "duree"], ["Taux", "taux"], ["Valeur nette au 31/12/2024", "valeurNette"],
      ["Utilisateur principal", "utilisateur"], ["Site", "site"], ["Direction/Service", "direction"],
      ["Emplacement", "emplacement"], ["Statut", "statut"], ["Observation", "observation"],
      ["Inventorié le", "inventorieLe", dateFr], ["Inventorié par", "inventoriePar"], ["Constat", "constat"],
      ["État physique", "etatPhysique"], ["Anomalie import", "anomalieImport"]
    ];
    const lignes = [entetes.map(e => e[0]), ...rows.map(r => entetes.map(([, k, f]) => (f ? f(r[k]) : r[k])))];
    const csv = "﻿" + lignes
      .map(l => l.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="registre-inventaire-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

export default router;
