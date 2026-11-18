// Import du registre du parc depuis le fichier Excel « Base inventaire.xlsx ».
//
//   npm run import                          → importe ../fichier excel/Base inventaire.xlsx
//   npm run import -- "chemin/fichier.xlsx"  → autre fichier
//   npm run import -- --remplacer           → vide le registre (et les relevés) avant l'import
//
// Les valeurs sont harmonisées (casse des types et catégories, taux 0,5 → 50 %) et chaque
// valeur illisible est écartée puis notée dans la colonne « anomalie_import » de l'équipement.
import "dotenv/config";
import ExcelJS from "exceljs";
import { fileURLToPath } from "node:url";
import { pool, initSchema, transaction } from "./db.js";
import { amorcerClassement } from "./classement.js";

const args = process.argv.slice(2);
const remplacer = args.includes("--remplacer");
const fichier = args.find(a => !a.startsWith("--"))
  ?? fileURLToPath(new URL("../../fichier excel/Base inventaire.xlsx", import.meta.url));

// En-tête Excel (normalisé) → [colonne SQL, genre]
const COLONNES = {
  "n ord": ["num_ordre", "entier"],
  "n compte": ["numero_compte", "code"],
  "type": ["type", "type"],
  "categorie": ["categorie", "categorie"],
  "n fiche": ["numero_fiche", "texte"],
  "id": ["identifiant", "texte"],
  "descriptif": ["descriptif", "texte"],
  "references serie imei": ["reference_serie", "texte"],
  "consommables accessoires": ["accessoires", "texte"],
  "valeurs d acquisition": ["valeur_acquisition", "nombre"],
  "date de debut": ["date_debut", "date"],
  "date de fin": ["date_fin", "date"],
  "duree": ["duree", "entier"],
  "taux": ["taux", "taux"],
  "cumul debut": ["cumul_debut", "nombre"],
  "dotation expl au 31 12 2024": ["dotation", "nombre"],
  "cumul fin": ["cumul_fin", "nombre"],
  "valeur nette au 31 12 2024": ["valeur_nette", "nombre"],
  "utilisateur principal": ["utilisateur", "texte"],
  "site": ["site", "texte"],
  "direction service": ["direction", "texte"],
  "emplacement": ["emplacement", "texte"],
  "statut": ["statut", "statut"],
  "colonne1": ["observation", "texte"],
  "nouvel utilisateur": ["nouvel_utilisateur", "texte"],
  "nouvelle date d attribution": ["date_nouvelle_attribution", "date"]
};

const cle = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

// Valeur brute d'une cellule ExcelJS (formules, texte enrichi, liens)
function brut(v) {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("formula" in v || "sharedFormula" in v) return v.result ?? null; // formule jamais recalculée → vide
    if ("richText" in v) return v.richText.map(t => t.text).join("");
    if ("text" in v) return v.text;
  }
  return typeof v === "string" ? v.trim() || null : v ?? null;
}

const TYPES = { "materiel informatique": "Matériel informatique", "materiel de transport": "Matériel de transport", "licences": "Licences" };
const STATUTS = { "en service": "En service", "pas encore en service": "Pas encore en service", "inactif": "Inactif", "hors service": "Hors service" };
// Écriture retenue pour chaque catégorie ; sinon la première rencontrée (ex. « imprimante » → « Imprimante »)
const categories = new Map([["wifi pocket", "Wifi Pocket"]]);

// Convertit une valeur ; renvoie { v } ou { anomalie }
function convertir(val, genre) {
  if (val === null) return { v: null };
  switch (genre) {
    case "entier":
    case "nombre": {
      const n = typeof val === "number" ? val : Number(String(val).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n) || val instanceof Date) return { anomalie: val };
      return { v: genre === "entier" ? Math.round(n) : n };
    }
    case "taux": {
      const n = typeof val === "number" ? val : Number(String(val).replace(",", "."));
      if (!Number.isFinite(n)) return { anomalie: val };
      return { v: n > 0 && n <= 1 ? Math.round(n * 10000) / 100 : n };   // 0,5 → 50 %
    }
    case "date":
      if (val instanceof Date) return { v: val.toISOString().slice(0, 10) };
      return { anomalie: val };
    case "code":
      return { v: String(val).trim() };
    case "type":
      return { v: TYPES[cle(val)] ?? String(val) };
    case "statut":
      return { v: STATUTS[cle(val)] ?? String(val) };
    case "categorie": {
      const k = cle(val);
      if (!categories.has(k)) categories.set(k, String(val)[0].toUpperCase() + String(val).slice(1));
      return { v: categories.get(k) };
    }
    default:
      return { v: val instanceof Date ? val.toISOString().slice(0, 10) : String(val).trim() || null };
  }
}

const fmt = v => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fichier);
  const ws = wb.worksheets[0];

  // Repère chaque colonne par son en-tête (ligne 1)
  const parColonne = {};
  ws.getRow(1).eachCell((cell, n) => { const c = COLONNES[cle(brut(cell.value))]; if (c) parColonne[n] = c; });
  if (!Object.values(parColonne).some(([col]) => col === "descriptif"))
    throw new Error(`Colonne « Descriptif » introuvable dans la feuille « ${ws.name} ».`);

  const equipements = [];
  ws.eachRow((row, numLigne) => {
    if (numLigne === 1) return;
    const e = { ligne_excel: numLigne }, anomalies = [];
    for (const [n, [col, genre]] of Object.entries(parColonne)) {
      const { v, anomalie } = convertir(brut(row.getCell(Number(n)).value), genre);
      if (anomalie !== undefined) anomalies.push(`${col} : « ${fmt(anomalie)} » ignoré`);
      e[col] = v ?? null;
    }
    if (!Object.entries(e).some(([k, v]) => k !== "ligne_excel" && v !== null)) return; // ligne vide
    if (!e.descriptif) anomalies.push("descriptif manquant");
    e.anomalie_import = anomalies.length ? `Ligne ${numLigne} : ${anomalies.join(" ; ")}` : null;
    equipements.push(e);
  });

  await initSchema();
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM equipements");
  if (rows[0].n && !remplacer) {
    console.error(`Le registre contient déjà ${rows[0].n} équipements : import annulé pour ne pas perdre les inventaires saisis.`);
    console.error("Pour tout remplacer (relevés d'inventaire compris) : npm run import -- --remplacer");
    process.exitCode = 1;
    return;
  }

  await transaction(async client => {
    if (remplacer) await client.query("TRUNCATE attributions, releves_inventaire, equipements RESTART IDENTITY");
    for (const e of equipements) {
      const cols = Object.keys(e);
      await client.query(
        `INSERT INTO equipements (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
        cols.map(c => e[c])
      );
    }
  });

  await initSchema(); await amorcerClassement(pool); // attributions et classement de départ
  // crée les attributions de départ à partir des colonnes Utilisateur / Nouvel utilisateur

  const anomalies = equipements.filter(e => e.anomalie_import);
  console.log(`${equipements.length} équipements importés depuis « ${ws.name} ».`);
  if (anomalies.length) {
    console.log(`${anomalies.length} ligne(s) avec des valeurs écartées (à vérifier dans l'interface) :`);
    for (const e of anomalies) console.log("  - " + e.anomalie_import);
  }
}

main()
  .catch(err => { console.error("Import impossible :", err.message); process.exitCode = 1; })
  .finally(() => pool.end());
