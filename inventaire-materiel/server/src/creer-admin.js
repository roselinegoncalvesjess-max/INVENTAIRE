// Crée le premier compte administrateur depuis la console (utile sous Docker, où la page
// « Créer le compte administrateur » ne reconnaît pas le poste serveur comme local).
//   npm run creer-admin
//   docker compose exec app node src/creer-admin.js
// Refuse de s'exécuter si un compte existe déjà.
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { pool, initSchema } from "./db.js";
import { controlerMotDePasse, hacher } from "./auth.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function main() {
  await initSchema();
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM utilisateurs");
  if (rows[0].n > 0) { console.error("Des comptes existent déjà : utilisez la page Utilisateurs de l'application."); process.exitCode = 1; return; }

  const nom = (await rl.question("Nom affiché : ")).trim();
  const identifiant = (await rl.question("Identifiant de connexion : ")).trim().toLowerCase();
  if (!nom || !/^[a-z0-9._-]{3,60}$/.test(identifiant)) { console.error("Nom obligatoire ; identifiant de 3 à 60 caractères (lettres, chiffres, . _ -)."); process.exitCode = 1; return; }
  const mdp = await rl.question("Mot de passe (10 caractères minimum, visible à la saisie) : ");
  const erreur = controlerMotDePasse(mdp, identifiant);
  if (erreur) { console.error(erreur); process.exitCode = 1; return; }

  await pool.query(
    "INSERT INTO utilisateurs (identifiant, nom, role, mot_de_passe) VALUES ($1, $2, 'admin', $3)",
    [identifiant, nom, await hacher(mdp)]
  );
  console.log(`Administrateur « ${identifiant} » créé. Effacez l'écran de la console (cls) pour masquer le mot de passe.`);
}

main()
  .catch(e => { console.error("Création impossible :", e.message); process.exitCode = 1; })
  .finally(() => { rl.close(); pool.end(); });
