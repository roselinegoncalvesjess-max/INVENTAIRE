import { Router } from "express";
import { pool, transaction } from "../db.js";
import { CHAMPS_EQUIPEMENT, validerAttribution, validerReleve } from "../validation.js";
import { enregistrerAttribution } from "../attributions.js";
import { controlerStructure } from "./classement.js";
import { amorcerClassement } from "../classement.js";

const router = Router();
const LIBELLES_TYPE = { personnel: "Personnel NPSP", service: "Service NPSP", site: "Site sanitaire",
  district: "District sanitaire", region: "Région sanitaire", non_affecte: "Non affecté" };

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
  ligneExcel: "ligne_excel", anomalieImport: "anomalie_import", modifieLe: "modifie_le",
  typeBeneficiaire: "type_beneficiaire", structureId: "structure_id", classementValide: "classement_valide",
  classementRaison: "classement_raison"
};
// Région, district et site sanitaire déduits de la structure rattachée
export const JOIN_STRUCTURE = `LEFT JOIN structures_sanitaires s1 ON s1.id = e.structure_id
  LEFT JOIN structures_sanitaires s2 ON s2.id = s1.parent_id
  LEFT JOIN structures_sanitaires s3 ON s3.id = s2.parent_id`;
export const SELECT_STRUCTURE = `s1.nom AS "structureNom",
       CASE s1.niveau WHEN 'site' THEN s1.nom END AS "siteSanitaire",
       CASE s1.niveau WHEN 'district' THEN s1.nom WHEN 'site' THEN s2.nom END AS "district",
       CASE s1.niveau WHEN 'region' THEN s1.nom WHEN 'district' THEN s2.nom WHEN 'site' THEN s3.nom END AS "region"`;

const SELECT = `SELECT ${Object.entries(COLONNES).map(([k, c]) => `e.${c} AS "${k}"`).join(", ")},
       (SELECT COUNT(*)::int FROM releves_inventaire r WHERE r.equipement_id = e.id) AS "nbReleves",
       (SELECT COUNT(DISTINCT a.detenteur)::int FROM attributions a WHERE a.equipement_id = e.id) AS "nbDetenteurs",
       (SELECT a.du FROM attributions a WHERE a.equipement_id = e.id AND a.en_cours) AS "detenteurDepuis",
       (SELECT a.detenteur FROM attributions a WHERE a.equipement_id = e.id AND NOT a.en_cours
         ORDER BY a.au DESC NULLS LAST, a.id DESC LIMIT 1) AS "detenteurPrecedent",
       (SELECT string_agg(DISTINCT a.detenteur, ' | ') FROM attributions a
         WHERE a.equipement_id = e.id AND NOT a.en_cours) AS "anciensDetenteurs",
       ${SELECT_STRUCTURE}
  FROM equipements e ${JOIN_STRUCTURE}`;

const SELECT_ATTRIB = `a.id, a.equipement_id AS "equipementId", a.detenteur, a.direction, a.site, a.emplacement,
       a.du, a.au, a.en_cours AS "enCours", a.motif, a.commentaire, a.origine, a.saisi_par AS "saisiPar", a.cree_le AS "creeLe",
       a.type_beneficiaire AS "typeBeneficiaire", a.recu_par AS "recuPar"`;

export const lire = async (db, id) => (await db.query(`${SELECT} WHERE e.id = $1`, [id])).rows[0] ?? null;

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

  // Utilisateur différent constaté sur place : nouvelle période de détention
  if (modifications.utilisateur) {
    const final = k => (k in champs ? champs[k] : avant[CHAMPS_EQUIPEMENT[k][0]] ?? null);
    await enregistrerAttribution(client, id, {
      detenteur: champs.utilisateur, date: releve.date, motif: "Constaté lors de l'inventaire",
      direction: final("direction"), site: final("site"), emplacement: final("emplacement"), commentaire: releve.commentaire,
      type: champs.utilisateur ? avant.type_beneficiaire : "non_affecte", structureId: champs.utilisateur ? avant.structure_id : null
    }, { nom: releve.agent, id: utilisateurId }, "inventaire");
    // Le type de bénéficiaire n'est pas saisi à l'inventaire : il reste à confirmer
    await client.query(
      `UPDATE equipements SET classement_valide = false,
              type_beneficiaire = CASE WHEN $2::text IS NULL THEN 'non_affecte' ELSE type_beneficiaire END,
              structure_id = CASE WHEN $2::text IS NULL THEN NULL ELSE structure_id END,
              classement_raison = $3 WHERE id = $1`,
      [id, champs.utilisateur, `Détenteur changé à l'inventaire du ${releve.date.split("-").reverse().join("/")} : type de bénéficiaire à confirmer`]);
  }
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
      `SELECT r.id, r.equipement_id AS "equipementId", r.date_releve AS "date", r.agent, r.constat, r.utilisateur_id AS "utilisateurId",
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
              commentaire, modifications, cree_le AS "creeLe", utilisateur_id AS "utilisateurId"
         FROM releves_inventaire WHERE equipement_id = $1 ORDER BY date_releve DESC, id DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// ---------- Correction de la date d'un inventaire physique ----------

const dateValide = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const aujourdhuiLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const controlerDate = v => (!dateValide(v) ? "Date invalide." : v > aujourdhuiLocal() ? "La date ne peut pas être dans le futur." : null);
// Change la date d'un relevé et répercute sur l'équipement (dernier inventaire) et la réattribution constatée ce jour-là
async function redaterReleve(client, r, vers) {
  await client.query("UPDATE releves_inventaire SET date_releve = $2 WHERE id = $1", [r.id, vers]);
  if (r.modifications?.utilisateur) {
    await client.query(
      `UPDATE attributions SET du = $3 WHERE equipement_id = $1 AND origine = 'inventaire' AND du = $2`,
      [r.equipement_id, r.date_releve, vers]);
    await client.query(
      `UPDATE attributions SET au = GREATEST(COALESCE(du, $3::date), $3::date)
        WHERE equipement_id = $1 AND NOT en_cours AND au = $2`, [r.equipement_id, r.date_releve, vers]);
  }
  await client.query(
    `UPDATE equipements e SET inventorie_le = d.date_releve, inventorie_par = d.agent, constat = d.constat,
            etat_physique = d.etat_physique, modifie_le = now()
       FROM (SELECT date_releve, agent, constat, etat_physique FROM releves_inventaire
              WHERE equipement_id = $1 ORDER BY date_releve DESC, id DESC LIMIT 1) d
      WHERE e.id = $1`, [r.equipement_id]);
}

// PUT /api/equipements/releves/:id — { date } : corrige la date d'un relevé
router.put("/releves/:id(\\d+)", async (req, res, next) => {
  const vers = req.body?.date;
  const erreur = controlerDate(vers);
  if (erreur) return res.status(400).json({ message: erreur });
  try {
    const resultat = await transaction(async client => {
      const { rows } = await client.query("SELECT * FROM releves_inventaire WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (!rows.length) return { statut: 404, message: "Relevé introuvable." };
      // Un agent corrige ses propres relevés ; un administrateur, tous
      if (req.utilisateur.role !== "admin" && !(rows[0].utilisateur_id === req.utilisateur.id ||
          (rows[0].utilisateur_id === null && rows[0].agent === req.utilisateur.nom)))
        return { statut: 403, message: "Seul l'agent qui a saisi ce relevé (ou un administrateur) peut en corriger la date." };
      await redaterReleve(client, rows[0], vers);
      return { statut: 200, equipementId: rows[0].equipement_id };
    });
    if (resultat.statut !== 200) return res.status(resultat.statut).json({ message: resultat.message });
    res.json(await lire(pool, resultat.equipementId));
  } catch (e) { next(e); }
});

// POST /api/equipements/releves/redater — { de, vers, tous } : déplace d'un coup les relevés d'une date à une autre
// (les siens ; tous les agents si « tous » et administrateur)
router.post("/releves/redater", async (req, res, next) => {
  const { de, vers } = req.body || {};
  const erreur = !dateValide(de) ? "Indiquez la date à corriger." : controlerDate(vers);
  if (erreur) return res.status(400).json({ message: erreur });
  if (de === vers) return res.status(400).json({ message: "Les deux dates sont identiques." });
  const tous = req.body?.tous === true && req.utilisateur.role === "admin";
  try {
    const n = await transaction(async client => {
      const valeurs = [de];
      let filtre = "";
      if (!tous) {
        valeurs.push(req.utilisateur.id, req.utilisateur.nom);
        filtre = "AND (utilisateur_id = $2 OR (utilisateur_id IS NULL AND agent = $3))";
      }
      const { rows } = await client.query(
        `SELECT * FROM releves_inventaire WHERE date_releve = $1 ${filtre} ORDER BY id FOR UPDATE`, valeurs);
      for (const r of rows) await redaterReleve(client, r, vers);
      return rows.length;
    });
    res.json({ modifies: n });
  } catch (e) { next(e); }
});

// GET /api/equipements/attributions — attributions et réattributions saisies (hors simple reprise de l'Excel)
router.get("/attributions", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_ATTRIB}, p.detenteur AS "precedent", (p.id IS NOT NULL) AS "aPrecedent",
              e.descriptif, e.numero_fiche AS "numeroFiche", e.categorie
         FROM attributions a
         JOIN equipements e ON e.id = a.equipement_id
         LEFT JOIN LATERAL (SELECT x.id, x.detenteur FROM attributions x
                             WHERE x.equipement_id = a.equipement_id AND x.id < a.id
                             ORDER BY x.id DESC LIMIT 1) p ON true
        WHERE a.origine <> 'import' OR p.id IS NOT NULL
        ORDER BY a.du DESC NULLS LAST, a.id DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/equipements/:id/attributions — détenteurs successifs, du plus récent au plus ancien
router.get("/:id(\\d+)/attributions", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_ATTRIB} FROM attributions a WHERE a.equipement_id = $1
        ORDER BY a.en_cours DESC, a.du DESC NULLS LAST, a.id DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/equipements/:id/attributions — réattribuer l'appareil (ou le remettre en stock)
router.post("/:id(\\d+)/attributions", async (req, res, next) => {
  const { erreur, donnees: d } = validerAttribution(req.body);
  if (erreur) return res.status(400).json({ message: erreur });
  try {
    const resultat = await transaction(async client => {
      const { rows } = await client.query("SELECT * FROM equipements WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (!rows.length) return { statut: 404, message: "Équipement introuvable." };
      const e = rows[0];
      const erreurStructure = await controlerStructure(client, d.type, d.structureId);
      if (erreurStructure) return { statut: 400, message: erreurStructure };
      // Remise à une structure sanitaire : la structure est le détenteur
      if (d.structureId) {
        const { rows: s } = await client.query("SELECT nom FROM structures_sanitaires WHERE id = $1", [d.structureId]);
        d.detenteur = s[0].nom;
      }
      const { rows: actuelle } = await client.query(
        "SELECT du FROM attributions WHERE equipement_id = $1 AND en_cours", [e.id]);
      if (actuelle[0]?.du && d.date < actuelle[0].du)
        return { statut: 400, message: "La date ne peut pas précéder le début de l'attribution actuelle." };
      const memes = ["direction", "site", "emplacement"].every(k => (e[k] ?? null) === d[k]);
      if ((e.utilisateur ?? null) === d.detenteur && memes && e.type_beneficiaire === d.type)
        return { statut: 400, message: d.detenteur ? "Ce bénéficiaire détient déjà l'appareil." : "L'appareil est déjà en stock." };

      await enregistrerAttribution(client, e.id, d, { nom: req.utilisateur.nom, id: req.utilisateur.id }, "saisie");
      await client.query(
        `UPDATE equipements SET utilisateur = $2, direction = $3, site = $4, emplacement = $5,
                type_beneficiaire = $6, structure_id = $7, classement_valide = true, classement_raison = NULL,
                modifie_le = now()
          WHERE id = $1`,
        [e.id, d.detenteur, d.direction, d.site, d.emplacement, d.type, d.structureId]
      );
      return { statut: 201 };
    });
    if (resultat.statut !== 201) return res.status(resultat.statut).json({ message: resultat.message });
    res.status(201).json(await lire(pool, req.params.id));
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
      await amorcerClassement(client); // propose un type de bénéficiaire, à valider
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
      ["Détenteur actuel", "utilisateur"], ["Détenteur depuis", "detenteurDepuis", dateFr],
      ["Détenteur précédent", "detenteurPrecedent"], ["Anciens détenteurs", "anciensDetenteurs"], ["Site", "site"], ["Direction/Service", "direction"],
      ["Emplacement", "emplacement"], ["Type de bénéficiaire", "typeBeneficiaire", t => LIBELLES_TYPE[t] || ""],
      ["Région sanitaire", "region"], ["District sanitaire", "district"], ["Site sanitaire", "siteSanitaire"],
      ["Classement validé", "classementValide", v => (v ? "Oui" : "À valider")], ["Statut", "statut"], ["Observation", "observation"],
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
