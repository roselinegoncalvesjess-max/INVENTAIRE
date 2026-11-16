import { Router } from "express";
import { pool, transaction } from "../db.js";
import { validerDecharge } from "../validation.js";

const router = Router();

// Requête commune : chaque décharge avec la liste de son matériel (en JSON)
const SELECT_DECHARGES = `
  SELECT d.id,
         d.numero,
         d.date_remise            AS "dateRemise",
         d.structure,
         d.beneficiaire_nom       AS "beneficiaireNom",
         d.beneficiaire_telephone AS "beneficiaireTelephone",
         d.beneficiaire_fonction  AS "beneficiaireFonction",
         d.cree_le                AS "creeLe",
         d.modifie_le             AS "modifieLe",
         d.cree_par               AS "creePar",
         COALESCE(
           json_agg(json_build_object(
             'id', a.id,
             'designation', a.designation,
             'quantite', a.quantite,
             'identifiant', a.identifiant,
             'imei', a.imei,
             'numeroSerie', a.numero_serie
           ) ORDER BY a.id) FILTER (WHERE a.id IS NOT NULL),
           '[]'
         ) AS articles
    FROM decharges d
    LEFT JOIN articles a ON a.decharge_id = d.id`;

async function lireDecharge(db, id) {
  const { rows } = await db.query(`${SELECT_DECHARGES} WHERE d.id = $1 GROUP BY d.id`, [id]);
  return rows[0] ?? null;
}

async function insererArticles(client, dechargeId, articles) {
  for (const a of articles) {
    await client.query(
      `INSERT INTO articles (decharge_id, designation, quantite, identifiant, imei, numero_serie)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [dechargeId, a.designation, a.quantite, a.identifiant, a.imei, a.numeroSerie]
    );
  }
}

// Numéro suivant pour l'année : DCH-2026-0001, DCH-2026-0002…
async function prochainNumero(client, annee) {
  // Verrou de transaction : deux enregistrements simultanés n'obtiennent pas le même numéro
  await client.query("SELECT pg_advisory_xact_lock(20261008)");
  const prefixe = `DCH-${annee}-`;
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(numero FROM $2::int) AS INTEGER)), 0) AS max
       FROM decharges WHERE numero LIKE $1`,
    [prefixe + "%", prefixe.length + 1]
  );
  return prefixe + String(rows[0].max + 1).padStart(4, "0");
}

// GET /api/decharges — liste complète
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${SELECT_DECHARGES} GROUP BY d.id ORDER BY d.date_remise DESC, d.numero DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/decharges/:id — une décharge
router.get("/:id(\\d+)", async (req, res, next) => {
  try {
    const d = await lireDecharge(pool, req.params.id);
    d ? res.json(d) : res.status(404).json({ message: "Décharge introuvable." });
  } catch (e) { next(e); }
});

// POST /api/decharges — nouvelle décharge
router.post("/", async (req, res, next) => {
  const { erreur, donnees: d } = validerDecharge(req.body);
  if (erreur) return res.status(400).json({ message: erreur });
  try {
    const id = await transaction(async client => {
      const numero = await prochainNumero(client, d.dateRemise.slice(0, 4));
      const { rows } = await client.query(
        `INSERT INTO decharges (numero, date_remise, structure, beneficiaire_nom,
                                beneficiaire_telephone, beneficiaire_fonction, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [numero, d.dateRemise, d.structure, d.beneficiaireNom, d.beneficiaireTelephone, d.beneficiaireFonction, req.utilisateur.nom]
      );
      await insererArticles(client, rows[0].id, d.articles);
      return rows[0].id;
    });
    res.status(201).json(await lireDecharge(pool, id));
  } catch (e) { next(e); }
});

// PUT /api/decharges/:id — modification (le matériel est remplacé)
router.put("/:id(\\d+)", async (req, res, next) => {
  const { erreur, donnees: d } = validerDecharge(req.body);
  if (erreur) return res.status(400).json({ message: erreur });
  try {
    const trouve = await transaction(async client => {
      const { rowCount } = await client.query(
        `UPDATE decharges
            SET date_remise = $2, structure = $3, beneficiaire_nom = $4,
                beneficiaire_telephone = $5, beneficiaire_fonction = $6, modifie_le = now()
          WHERE id = $1`,
        [req.params.id, d.dateRemise, d.structure, d.beneficiaireNom, d.beneficiaireTelephone, d.beneficiaireFonction]
      );
      if (!rowCount) return false;
      await client.query("DELETE FROM articles WHERE decharge_id = $1", [req.params.id]);
      await insererArticles(client, req.params.id, d.articles);
      return true;
    });
    if (!trouve) return res.status(404).json({ message: "Décharge introuvable." });
    res.json(await lireDecharge(pool, req.params.id));
  } catch (e) { next(e); }
});

// DELETE /api/decharges/:id — suppression (matériel supprimé en cascade)
router.delete("/:id(\\d+)", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM decharges WHERE id = $1", [req.params.id]);
    rowCount ? res.status(204).end() : res.status(404).json({ message: "Décharge introuvable." });
  } catch (e) { next(e); }
});

// ---------- Exports CSV (séparateur « ; » + BOM : s'ouvre directement dans Excel) ----------

const dateFr = d => (d ? d.split("-").reverse().join("/") : "");

function envoyerCsv(res, nomFichier, lignes) {
  const csv = "﻿" + lignes
    .map(l => l.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nomFichier}"`);
  res.send(csv);
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// GET /api/decharges/export/inventaire — une ligne par équipement
router.get("/export/inventaire", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.numero, d.date_remise, d.structure, d.beneficiaire_nom, d.beneficiaire_fonction,
              d.beneficiaire_telephone, a.designation, a.quantite, a.identifiant, a.imei, a.numero_serie
         FROM articles a JOIN decharges d ON d.id = a.decharge_id
        ORDER BY d.date_remise DESC, d.numero DESC, a.id`
    );
    envoyerCsv(res, `inventaire-materiel-${aujourdhui()}.csv`, [
      ["N° décharge", "Date de remise", "Structure", "Bénéficiaire", "Fonction", "Téléphone",
       "Désignation", "Quantité", "Identifiant", "IMEI", "N° de série"],
      ...rows.map(r => [r.numero, dateFr(r.date_remise), r.structure, r.beneficiaire_nom, r.beneficiaire_fonction,
                        r.beneficiaire_telephone, r.designation, r.quantite, r.identifiant, r.imei, r.numero_serie])
    ]);
  } catch (e) { next(e); }
});

// GET /api/decharges/export/decharges — une ligne par décharge
router.get("/export/decharges", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.numero, d.date_remise, d.structure, d.beneficiaire_nom, d.beneficiaire_fonction,
              d.beneficiaire_telephone, COUNT(a.id) AS nb, COALESCE(SUM(a.quantite), 0) AS total
         FROM decharges d LEFT JOIN articles a ON a.decharge_id = d.id
        GROUP BY d.id ORDER BY d.date_remise DESC, d.numero DESC`
    );
    envoyerCsv(res, `decharges-${aujourdhui()}.csv`, [
      ["N° décharge", "Date de remise", "Structure", "Bénéficiaire", "Fonction", "Téléphone", "Nb lignes", "Quantité totale"],
      ...rows.map(r => [r.numero, dateFr(r.date_remise), r.structure, r.beneficiaire_nom, r.beneficiaire_fonction,
                        r.beneficiaire_telephone, r.nb, r.total])
    ]);
  } catch (e) { next(e); }
});

export default router;
