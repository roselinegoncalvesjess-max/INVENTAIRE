// Fonctions utilitaires partagées par les composants

export const fmtDate = d => {
  if (!d) return "—";
  const [y, m, j] = d.slice(0, 10).split("-");
  return `${j}/${m}/${y}`;
};

// Minuscules sans accents, pour la recherche
export const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// IMEI : 15 chiffres + clé de Luhn
export function imeiOk(v) {
  if (!v) return true;
  if (!/^\d{15}$/.test(v)) return false;
  let s = 0;
  for (let i = 0; i < 15; i++) {
    let d = +v[14 - i];
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    s += d;
  }
  return s % 10 === 0;
}

export const quantiteTotale = articles => (articles || []).reduce((s, a) => s + (+a.quantite || 0), 0);

// Tous les équipements, chacun rattaché à sa décharge
export const aplatir = decharges =>
  decharges.flatMap(d => (d.articles || []).map(a => ({ ...a, decharge: d })));

// Clés IMEI / n° de série présentes plusieurs fois dans l'inventaire
export function doublons(items) {
  const vus = new Set(), dups = new Set();
  for (const it of items) {
    for (const k of [it.imei && "i:" + it.imei, it.numeroSerie && "s:" + norm(it.numeroSerie)]) {
      if (!k) continue;
      if (vus.has(k)) dups.add(k);
      vus.add(k);
    }
  }
  return dups;
}

// ---------- Inventaire physique ----------

export const CONSTATS = ["Présent", "Absent", "Volé ou perdu"];
export const ETATS = ["Bon état", "Usagé", "Défaillant", "Hors d'usage"];
export const STATUTS = ["En service", "Pas encore en service", "Inactif", "En réparation", "Hors service", "Volé ou perdu", "Réformé"];

// Informations attendues pour chaque équipement du registre
export const CHAMPS_REQUIS = {
  numeroFiche: "N° de fiche",
  referenceSerie: "N° de série / IMEI",
  valeurAcquisition: "Valeur d'acquisition",
  dateDebut: "Date d'acquisition",
  utilisateur: "Utilisateur principal",
  site: "Site",
  direction: "Direction / service",
  emplacement: "Emplacement",
  statut: "Statut"
};

const vide = v => v === null || v === undefined || String(v).trim() === "";

// Libellés des informations manquantes (une valeur d'acquisition à 0 est considérée comme manquante)
export const manquants = e =>
  Object.entries(CHAMPS_REQUIS)
    .filter(([k]) => vide(e[k]) || (k === "valeurAcquisition" && Number(e[k]) === 0))
    .map(([, libelle]) => libelle);

export const fmtMontant = n =>
  n === null || n === undefined || n === "" ? "—" : new Intl.NumberFormat("fr-FR").format(n);

export const aujourdhui = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// N° de série présents sur plusieurs équipements
export function seriesEnDouble(equipements) {
  const n = new Map();
  for (const e of equipements) if (e.referenceSerie) n.set(norm(e.referenceSerie), (n.get(norm(e.referenceSerie)) || 0) + 1);
  return new Set([...n].filter(([, c]) => c > 1).map(([k]) => k));
}

// Montant abrégé : 221 442 018 → « 221,4 M »
export const fmtCompact = n => {
  if (n === null || n === undefined) return "—";
  const a = Math.abs(n);
  const f = (v, s) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${s}`;
  return a >= 1e9 ? f(n / 1e9, "Md") : a >= 1e6 ? f(n / 1e6, "M") : a >= 1e3 ? f(n / 1e3, "k") : String(n);
};

// Statuts : couleur d'état (toujours accompagnée du libellé)
export const STATUT_STYLE = {
  "En service": { couleur: "var(--st-bon)", classe: "ok" },
  "Pas encore en service": { couleur: "var(--st-neutre)", classe: "info" },
  "Inactif": { couleur: "var(--st-attention)", classe: "ex" },
  "En réparation": { couleur: "var(--st-attention)", classe: "ex" },
  "Hors service": { couleur: "var(--st-critique)", classe: "dup" },
  "Volé ou perdu": { couleur: "var(--st-critique)", classe: "dup" },
  "Réformé": { couleur: "var(--st-vide)", classe: "" },
  "Non renseigné": { couleur: "var(--st-vide)", classe: "" }
};

export const compter = (liste, cle) =>
  liste.reduce((m, e) => { const k = (typeof cle === "function" ? cle(e) : e[cle]) || "Non renseigné"; m[k] = (m[k] || 0) + 1; return m; }, {});

// Types de bénéficiaire (ordre d'affichage) — couleurs : voir les jetons --b-* de styles.css
export const TYPES_BENEFICIAIRE = {
  personnel:   { libelle: "Personnel NPSP",      court: "Personnel", couleur: "var(--b-personnel)" },
  service:     { libelle: "Service NPSP",        court: "Service",   couleur: "var(--b-service)" },
  site:        { libelle: "Site sanitaire",      court: "Site",      couleur: "var(--b-site)" },
  district:    { libelle: "District sanitaire",  court: "District",  couleur: "var(--b-district)" },
  region:      { libelle: "Région sanitaire",    court: "Région",    couleur: "var(--b-region)" },
  non_affecte: { libelle: "Non affecté",         court: "Non affecté", couleur: "var(--b-aucun)" }
};
export const NIVEAU_DU_TYPE = { site: "site", district: "district", region: "region" };
export const NIVEAUX = { region: "Région sanitaire", district: "District sanitaire", site: "Site sanitaire" };

// Date de l'inventaire physique choisie pour la séance de saisie (mémorisée sur ce poste)
const CLE_SEANCE = "parcit.date-inventaire";
export const lireDateSeance = () => {
  try { const d = localStorage.getItem(CLE_SEANCE); return d && d <= aujourdhui() ? d : ""; } catch { return ""; }
};
export const ecrireDateSeance = d => { try { d ? localStorage.setItem(CLE_SEANCE, d) : localStorage.removeItem(CLE_SEANCE); } catch { /* stockage indisponible */ } };
