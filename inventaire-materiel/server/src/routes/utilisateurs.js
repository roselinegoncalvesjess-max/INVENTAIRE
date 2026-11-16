// Gestion des comptes (réservée aux administrateurs)
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { pool } from "../db.js";
import { controlerMotDePasse, hacher, ROLES } from "../auth.js";

const router = Router();
const texte = v => (typeof v === "string" ? v.trim() : "");
const SELECT = `SELECT id, identifiant, nom, role, actif, doit_changer AS "doitChanger",
                       derniere_connexion AS "derniereConnexion", cree_le AS "creeLe" FROM utilisateurs`;

// Mot de passe provisoire lisible (sans caractères ambigus), à changer à la première connexion
function motDePasseProvisoire() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return [...randomBytes(14)].map(b => c[b % c.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}

async function nbAdminsActifs(sauf) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM utilisateurs WHERE role = 'admin' AND actif AND id <> $1", [sauf]);
  return rows[0].n;
}

router.get("/", async (req, res, next) => {
  try { res.json((await pool.query(`${SELECT} ORDER BY actif DESC, nom`)).rows); } catch (e) { next(e); }
});

// Création : l'administrateur reçoit un mot de passe provisoire à transmettre
router.post("/", async (req, res, next) => {
  const identifiant = texte(req.body.identifiant).toLowerCase(), nom = texte(req.body.nom), role = req.body.role;
  if (!/^[a-z0-9._-]{3,60}$/.test(identifiant)) return res.status(400).json({ message: "Identifiant : 3 à 60 caractères (lettres, chiffres, . _ -)." });
  if (!nom) return res.status(400).json({ message: "Le nom est obligatoire." });
  if (!ROLES[role]) return res.status(400).json({ message: "Rôle inconnu." });
  try {
    const provisoire = motDePasseProvisoire();
    const { rows } = await pool.query(
      `INSERT INTO utilisateurs (identifiant, nom, role, mot_de_passe, doit_changer) VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (identifiant) DO NOTHING RETURNING id`,
      [identifiant, nom, role, await hacher(provisoire)]
    );
    if (!rows.length) return res.status(409).json({ message: `L'identifiant « ${identifiant} » existe déjà.` });
    const u = (await pool.query(`${SELECT} WHERE id = $1`, [rows[0].id])).rows[0];
    res.status(201).json({ utilisateur: u, motDePasseProvisoire: provisoire });
  } catch (e) { next(e); }
});

// Modification du nom, du rôle ou de l'activation
router.put("/:id(\\d+)", async (req, res, next) => {
  const id = Number(req.params.id), { nom, role, actif } = req.body || {};
  if (role !== undefined && !ROLES[role]) return res.status(400).json({ message: "Rôle inconnu." });
  if (nom !== undefined && !texte(nom)) return res.status(400).json({ message: "Le nom est obligatoire." });
  try {
    const { rows } = await pool.query("SELECT * FROM utilisateurs WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ message: "Compte introuvable." });
    const perdAdmin = rows[0].role === "admin" && rows[0].actif && ((role && role !== "admin") || actif === false);
    if (perdAdmin && (await nbAdminsActifs(id)) === 0)
      return res.status(400).json({ message: "Il doit rester au moins un administrateur actif." });
    await pool.query(
      `UPDATE utilisateurs SET nom = COALESCE($2, nom), role = COALESCE($3, role), actif = COALESCE($4, actif) WHERE id = $1`,
      [id, nom === undefined ? null : texte(nom), role ?? null, typeof actif === "boolean" ? actif : null]
    );
    if (actif === false) await pool.query("DELETE FROM sessions WHERE utilisateur_id = $1", [id]);
    res.json((await pool.query(`${SELECT} WHERE id = $1`, [id])).rows[0]);
  } catch (e) { next(e); }
});

// Réinitialisation : nouveau mot de passe provisoire, sessions fermées
router.post("/:id(\\d+)/reinitialiser", async (req, res, next) => {
  try {
    const provisoire = motDePasseProvisoire();
    if (controlerMotDePasse(provisoire)) throw new Error("mot de passe provisoire invalide");
    const { rowCount } = await pool.query(
      "UPDATE utilisateurs SET mot_de_passe = $2, doit_changer = true WHERE id = $1", [req.params.id, await hacher(provisoire)]);
    if (!rowCount) return res.status(404).json({ message: "Compte introuvable." });
    await pool.query("DELETE FROM sessions WHERE utilisateur_id = $1", [req.params.id]);
    res.json({ motDePasseProvisoire: provisoire });
  } catch (e) { next(e); }
});

export default router;
