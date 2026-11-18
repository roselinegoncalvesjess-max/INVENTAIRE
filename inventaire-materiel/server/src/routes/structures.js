import { Router } from "express";
import { pool } from "../db.js";

// Référentiel des structures sanitaires : régions → districts → sites
const router = Router();
const NIVEAUX = ["region", "district", "site"];
const PARENT_ATTENDU = { region: null, district: "region", site: "district" };
const texte = v => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.niveau, s.nom, s.parent_id AS "parentId", s.responsable, s.telephone,
              (SELECT COUNT(*)::int FROM equipements e WHERE e.structure_id = s.id) AS "nbEquipements"
         FROM structures_sanitaires s ORDER BY s.niveau, s.nom`);
    res.json(rows);
  } catch (e) { next(e); }
});

// Contrôle le niveau, le nom et le rattachement ; renvoie { erreur } ou { d }
async function valider(body, id = null) {
  const d = {
    niveau: texte(body.niveau), nom: texte(body.nom).toUpperCase(),
    parentId: body.parentId ? Number(body.parentId) : null,
    responsable: texte(body.responsable) || null, telephone: texte(body.telephone) || null
  };
  if (!NIVEAUX.includes(d.niveau)) return { erreur: "Niveau inconnu (région, district ou site)." };
  if (!d.nom || d.nom.length > 150) return { erreur: "Le nom de la structure est obligatoire." };
  if (d.parentId) {
    const { rows } = await pool.query("SELECT niveau FROM structures_sanitaires WHERE id = $1", [d.parentId]);
    if (!rows.length || rows[0].niveau !== PARENT_ATTENDU[d.niveau])
      return { erreur: d.niveau === "site" ? "Un site se rattache à un district." : d.niveau === "district" ? "Un district se rattache à une région." : "Une région n'a pas de rattachement." };
    if (d.parentId === id) return { erreur: "Une structure ne peut pas se rattacher à elle-même." };
  }
  const { rows } = await pool.query(
    "SELECT id FROM structures_sanitaires WHERE niveau = $1 AND upper(nom) = $2 AND id IS DISTINCT FROM $3",
    [d.niveau, d.nom, id]);
  if (rows.length) return { erreur: "Cette structure existe déjà." };
  return { d };
}

router.post("/", async (req, res, next) => {
  try {
    const { erreur, d } = await valider(req.body || {});
    if (erreur) return res.status(400).json({ message: erreur });
    const { rows } = await pool.query(
      `INSERT INTO structures_sanitaires (niveau, nom, parent_id, responsable, telephone)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`, [d.niveau, d.nom, d.parentId, d.responsable, d.telephone]);
    res.status(201).json({ id: rows[0].id });
  } catch (e) { next(e); }
});

router.put("/:id(\\d+)", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows: actuel } = await pool.query("SELECT niveau FROM structures_sanitaires WHERE id = $1", [id]);
    if (!actuel.length) return res.status(404).json({ message: "Structure introuvable." });
    const { erreur, d } = await valider({ ...req.body, niveau: actuel[0].niveau }, id);
    if (erreur) return res.status(400).json({ message: erreur });
    await pool.query(
      `UPDATE structures_sanitaires SET nom = $2, parent_id = $3, responsable = $4, telephone = $5 WHERE id = $1`,
      [id, d.nom, d.parentId, d.responsable, d.telephone]);
    res.json({ id });
  } catch (e) { next(e); }
});

// Suppression réservée aux administrateurs, et seulement si rien n'y est rattaché
router.delete("/:id(\\d+)", async (req, res, next) => {
  if (req.utilisateur.role !== "admin") return res.status(403).json({ message: "Réservé aux administrateurs." });
  try {
    const { rows } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM equipements WHERE structure_id = $1)
            + (SELECT COUNT(*) FROM structures_sanitaires WHERE parent_id = $1) AS n`, [req.params.id]);
    if (Number(rows[0].n)) return res.status(409).json({ message: "Des équipements ou des structures y sont encore rattachés." });
    await pool.query("DELETE FROM structures_sanitaires WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
