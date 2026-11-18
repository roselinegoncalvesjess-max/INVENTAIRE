import { Router } from "express";
import { pool, transaction } from "../db.js";
import { groupesDeNoms, NIVEAU_DU_TYPE, TYPES_BENEFICIAIRE } from "../classement.js";

// Classement des équipements par type de bénéficiaire et regroupement des noms en double
const router = Router();

// Vérifie qu'une structure existe et correspond au type ; renvoie un message d'erreur ou null
export async function controlerStructure(db, type, structureId) {
  const niveau = NIVEAU_DU_TYPE[type];
  if (!niveau) return null;
  if (!structureId) return "Choisissez la structure sanitaire.";
  const { rows } = await db.query("SELECT niveau FROM structures_sanitaires WHERE id = $1", [structureId]);
  if (!rows.length) return "Structure sanitaire introuvable.";
  if (rows[0].niveau !== niveau) return "La structure choisie ne correspond pas au type de bénéficiaire.";
  return null;
}

// PUT /api/classement — { ids: [..], type, structureId } : valide le classement de plusieurs équipements
router.put("/", async (req, res, next) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(Number).filter(Number.isInteger))] : [];
  const type = req.body?.type;
  const structureId = NIVEAU_DU_TYPE[type] ? Number(req.body?.structureId) || null : null;
  if (!ids.length) return res.status(400).json({ message: "Sélectionnez au moins un équipement." });
  if (!TYPES_BENEFICIAIRE.includes(type)) return res.status(400).json({ message: "Type de bénéficiaire inconnu." });
  try {
    const erreur = await controlerStructure(pool, type, structureId);
    if (erreur) return res.status(400).json({ message: erreur });
    const n = await transaction(async client => {
      const r = await client.query(
        `UPDATE equipements SET type_beneficiaire = $2, structure_id = $3, classement_valide = true,
                classement_raison = NULL, modifie_le = now()
          WHERE id = ANY($1::int[])`, [ids, type, structureId]);
      await client.query(
        "UPDATE attributions SET type_beneficiaire = $2, structure_id = $3 WHERE equipement_id = ANY($1::int[]) AND en_cours",
        [ids, type, structureId]);
      return r.rowCount;
    });
    res.json({ modifies: n });
  } catch (e) { next(e); }
});

// GET /api/classement/doublons — noms de personnes qui semblent désigner la même personne
router.get("/doublons", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT utilisateur AS nom, COUNT(*)::int AS nb FROM equipements
        WHERE utilisateur IS NOT NULL AND type_beneficiaire = 'personnel' GROUP BY utilisateur`);
    res.json(groupesDeNoms(rows));
  } catch (e) { next(e); }
});

// POST /api/classement/fusionner — { noms: [...], nom } : remplace les variantes par le nom retenu
router.post("/fusionner", async (req, res, next) => {
  const nom = typeof req.body?.nom === "string" ? req.body.nom.replace(/\s+/g, " ").trim() : "";
  const noms = Array.isArray(req.body?.noms) ? req.body.noms.filter(n => typeof n === "string" && n !== nom) : [];
  if (!nom || nom.length > 150) return res.status(400).json({ message: "Indiquez le nom à conserver." });
  if (!noms.length) return res.status(400).json({ message: "Aucun autre nom à remplacer." });
  try {
    const n = await transaction(async client => {
      const r = await client.query(
        "UPDATE equipements SET utilisateur = $1, modifie_le = now() WHERE utilisateur = ANY($2::text[])", [nom, noms]);
      await client.query("UPDATE attributions SET detenteur = $1 WHERE detenteur = ANY($2::text[])", [nom, noms]);
      return r.rowCount;
    });
    res.json({ modifies: n });
  } catch (e) { next(e); }
});

export default router;
