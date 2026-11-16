// Comptes, mots de passe et sessions (cookie HttpOnly), sans dépendance externe
import { Router } from "express";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "./db.js";

const scrypt = promisify(scryptCb);
const COOKIE = "inventaire_session";
const DUREE_SESSION_H = 12;
export const ROLES = { admin: "Administrateur", agent: "Agent d'inventaire", lecteur: "Lecture seule" };
export const LONGUEUR_MIN = 10;

// ---------- Mots de passe ----------

export async function hacher(motDePasse) {
  const sel = randomBytes(16);
  const empreinte = await scrypt(motDePasse, sel, 64);
  return `${sel.toString("hex")}$${empreinte.toString("hex")}`;
}

async function verifier(motDePasse, stocke) {
  const [sel, attendu] = String(stocke).split("$");
  if (!sel || !attendu) return false;
  const calcule = await scrypt(motDePasse, Buffer.from(sel, "hex"), 64);
  const ref = Buffer.from(attendu, "hex");
  return ref.length === calcule.length && timingSafeEqual(ref, calcule);
}

// Empreinte utilisée pour les comptes inexistants : même temps de réponse
const LEURRE = hacher(randomBytes(12).toString("hex"));

export function controlerMotDePasse(mdp, identifiant = "") {
  if (typeof mdp !== "string" || mdp.length < LONGUEUR_MIN) return `Le mot de passe doit contenir au moins ${LONGUEUR_MIN} caractères.`;
  if (mdp.length > 200) return "Le mot de passe est trop long.";
  if (identifiant && mdp.toLowerCase().includes(identifiant.toLowerCase())) return "Le mot de passe ne doit pas contenir l'identifiant.";
  return null;
}

// ---------- Sessions ----------

const empreinteJeton = j => createHash("sha256").update(j).digest("hex");

function lireCookie(req) {
  const m = (req.headers.cookie || "").split(";").map(s => s.trim()).find(s => s.startsWith(COOKIE + "="));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : null;
}

function poserCookie(res, valeur, maxAgeS) {
  res.setHeader("Set-Cookie",
    `${COOKIE}=${valeur}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeS}${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`);
}

async function ouvrirSession(res, utilisateurId) {
  const jeton = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO sessions (jeton, utilisateur_id, expire_le) VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [empreinteJeton(jeton), utilisateurId, DUREE_SESSION_H]
  );
  await pool.query("DELETE FROM sessions WHERE expire_le < now()");
  poserCookie(res, jeton, DUREE_SESSION_H * 3600);
}

const publicUtilisateur = u => ({
  id: u.id, identifiant: u.identifiant, nom: u.nom, role: u.role, doitChanger: u.doit_changer
});

// Middleware : rattache l'utilisateur connecté à req.utilisateur (ou répond 401)
export async function exigerConnexion(req, res, next) {
  try {
    const jeton = lireCookie(req);
    if (!jeton) return res.status(401).json({ message: "Connexion requise." });
    const { rows } = await pool.query(
      `SELECT u.* FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur_id
        WHERE s.jeton = $1 AND s.expire_le > now() AND u.actif`,
      [empreinteJeton(jeton)]
    );
    if (!rows.length) return res.status(401).json({ message: "Session expirée : reconnectez-vous." });
    req.utilisateur = rows[0];
    req.jeton = jeton;
    // Un mot de passe provisoire doit être changé avant toute autre action
    if (rows[0].doit_changer && !req.originalUrl.startsWith("/api/auth/"))
      return res.status(403).json({ message: "Changez d'abord votre mot de passe provisoire." });
    next();
  } catch (e) { next(e); }
}

// Middleware : lecture pour tous, écriture réservée aux rôles donnés
export const ecritureReservee = (...roles) => (req, res, next) => {
  if (["GET", "HEAD"].includes(req.method) || roles.includes(req.utilisateur.role)) return next();
  res.status(403).json({ message: "Votre compte est en lecture seule : modification impossible." });
};

export const exigerRole = (...roles) => (req, res, next) =>
  roles.includes(req.utilisateur.role) ? next() : res.status(403).json({ message: "Accès réservé aux administrateurs." });

// ---------- Limitation des essais de connexion ----------

const essais = new Map(); // clé → { n, depuis }
const FENETRE_MS = 15 * 60 * 1000, MAX_ESSAIS = 8;
function bloque(cle) {
  const e = essais.get(cle);
  if (!e || Date.now() - e.depuis > FENETRE_MS) return false;
  return e.n >= MAX_ESSAIS;
}
function echec(cle) {
  const e = essais.get(cle);
  if (!e || Date.now() - e.depuis > FENETRE_MS) essais.set(cle, { n: 1, depuis: Date.now() });
  else e.n++;
}

const estLocal = req => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
const texte = v => (typeof v === "string" ? v.trim() : "");

// ---------- Routes /api/auth ----------

export const routesAuth = Router();

// État : faut-il créer le premier administrateur ? (seulement depuis le poste serveur)
routesAuth.get("/etat", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM utilisateurs");
    res.json({ configure: rows[0].n > 0, local: estLocal(req), longueurMin: LONGUEUR_MIN });
  } catch (e) { next(e); }
});

// Premier administrateur : possible uniquement s'il n'existe aucun compte, et depuis le poste serveur
routesAuth.post("/initialiser", async (req, res, next) => {
  if (!estLocal(req)) return res.status(403).json({ message: "Le premier compte se crée sur le poste qui héberge l'application (http://localhost:3001)." });
  const identifiant = texte(req.body.identifiant).toLowerCase(), nom = texte(req.body.nom), mdp = req.body.motDePasse;
  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM utilisateurs");
    if (rows[0].n > 0) return res.status(409).json({ message: "Un administrateur existe déjà." });
  } catch (e) { return next(e); }
  if (!/^[a-z0-9._-]{3,60}$/.test(identifiant)) return res.status(400).json({ message: "Identifiant : 3 à 60 caractères (lettres, chiffres, . _ -)." });
  if (!nom) return res.status(400).json({ message: "Le nom est obligatoire." });
  const err = controlerMotDePasse(mdp, identifiant);
  if (err) return res.status(400).json({ message: err });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE utilisateurs IN EXCLUSIVE MODE");
    const { rows: n } = await client.query("SELECT COUNT(*)::int AS n FROM utilisateurs");
    if (n[0].n > 0) { await client.query("ROLLBACK"); return res.status(409).json({ message: "Un administrateur existe déjà." }); }
    const { rows } = await client.query(
      `INSERT INTO utilisateurs (identifiant, nom, role, mot_de_passe) VALUES ($1, $2, 'admin', $3) RETURNING *`,
      [identifiant, nom, await hacher(mdp)]
    );
    await client.query("COMMIT");
    await ouvrirSession(res, rows[0].id);
    res.status(201).json(publicUtilisateur(rows[0]));
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); next(e); }
  finally { client.release(); }
});

routesAuth.post("/connexion", async (req, res, next) => {
  const identifiant = texte(req.body.identifiant).toLowerCase(), mdp = String(req.body.motDePasse ?? "");
  const cle = `${req.socket.remoteAddress}|${identifiant}`;
  if (bloque(cle)) return res.status(429).json({ message: "Trop d'essais : réessayez dans 15 minutes." });
  try {
    const { rows } = await pool.query("SELECT * FROM utilisateurs WHERE identifiant = $1 AND actif", [identifiant]);
    const ok = await verifier(mdp, rows[0]?.mot_de_passe ?? await LEURRE);
    if (!rows.length || !ok) { echec(cle); return res.status(401).json({ message: "Identifiant ou mot de passe incorrect." }); }
    essais.delete(cle);
    await pool.query("UPDATE utilisateurs SET derniere_connexion = now() WHERE id = $1", [rows[0].id]);
    await ouvrirSession(res, rows[0].id);
    res.json(publicUtilisateur(rows[0]));
  } catch (e) { next(e); }
});

routesAuth.post("/deconnexion", async (req, res, next) => {
  try {
    const jeton = lireCookie(req);
    if (jeton) await pool.query("DELETE FROM sessions WHERE jeton = $1", [empreinteJeton(jeton)]);
    poserCookie(res, "", 0);
    res.status(204).end();
  } catch (e) { next(e); }
});

routesAuth.get("/moi", exigerConnexion, (req, res) => res.json(publicUtilisateur(req.utilisateur)));

// Changement de son propre mot de passe (ferme les autres sessions)
routesAuth.put("/mot-de-passe", exigerConnexion, async (req, res, next) => {
  const u = req.utilisateur, { actuel, nouveau } = req.body || {};
  try {
    if (!(await verifier(String(actuel ?? ""), u.mot_de_passe))) return res.status(400).json({ message: "Mot de passe actuel incorrect." });
    const err = controlerMotDePasse(nouveau, u.identifiant) || (nouveau === actuel ? "Choisissez un mot de passe différent de l'actuel." : null);
    if (err) return res.status(400).json({ message: err });
    await pool.query("UPDATE utilisateurs SET mot_de_passe = $2, doit_changer = false WHERE id = $1", [u.id, await hacher(nouveau)]);
    await pool.query("DELETE FROM sessions WHERE utilisateur_id = $1 AND jeton <> $2", [u.id, empreinteJeton(req.jeton)]);
    res.json(publicUtilisateur({ ...u, doit_changer: false }));
  } catch (e) { next(e); }
});
