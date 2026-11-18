// Classement des équipements par type de bénéficiaire et référentiel des structures sanitaires.
// La reprise automatique ne touche que les équipements pas encore classés (type_beneficiaire NULL)
// et laisse chaque proposition « à valider » (classement_valide = false).

export const TYPES_BENEFICIAIRE = ["personnel", "service", "site", "district", "region", "non_affecte"];
export const NIVEAU_DU_TYPE = { site: "site", district: "district", region: "region" };

const CENTRE_SANTE = /^(CSR|CSI|CSU|CMS|CS|DR|HG|CHR|CHU|PMI|ESPC|SSSU|INHP)\b/i;
const DISTRICT = /^D?DS\s+(.+)$/i;                       // « DS AGBOVILLE », « DDS ISSIA »
const NON_AFFECTE = /pas encore (été )?affect|non affect/i;
const EN_ATTENTE = /en attente de la fiche/i;
const SERVICE = /^(DSI|SI[- ]|CAD\b|CAC\b|BUREAU|MAGASIN|PMO\b|SERVICE|LHSPLA\b|DIRECTION|POOL|AGENCE|DPAS|DAF|DG\b|DCM|DRH|CELLULE|ANTENNE)/i;

const propre = s => (s ?? "").replace(/\s+/g, " ").trim();

// Lit « DS AGBOVILLE/CSR N'CHOMPO/PHARMACIE » et le site → { district, site }
export function lireStructure(e) {
  const parties = propre(e.direction).split("/").map(propre).filter(Boolean);
  const m = parties[0]?.match(DISTRICT);
  const district = m ? `DS ${propre(m[1]).toUpperCase()}` : null;
  let site = null;
  if (CENTRE_SANTE.test(propre(e.site))) site = propre(e.site).toUpperCase();
  else if (district && parties[1] && CENTRE_SANTE.test(parties[1])) site = parties[1].toUpperCase();
  return { district, site };
}

// Propose un type de bénéficiaire pour un équipement : { type, district, site, raison }
export function proposer(e) {
  const u = propre(e.utilisateur), tout = [u, e.site, e.direction].map(propre).join(" | ");
  const { district, site } = lireStructure(e);
  if (site) return { type: "site", district, site, raison: `Centre de santé « ${site} »${district ? ` du ${district}` : ""}` };
  if (district) return { type: "district", district, raison: `Direction « ${propre(e.direction)} »` };
  if (EN_ATTENTE.test(tout)) return { type: "non_affecte", raison: "Affecté, mais fiche d'attribution manquante : bénéficiaire à préciser" };
  if (!u || NON_AFFECTE.test(u)) return { type: "non_affecte", raison: u ? `« ${u} » dans le registre` : "Aucun utilisateur dans le registre" };
  if (SERVICE.test(u)) return { type: "service", raison: `« ${u} » désigne un service ou un lieu de la NPSP` };
  if (u.split(" ").length >= 2) return { type: "personnel", raison: "Nom de personne" };
  return { type: "personnel", raison: `Nom en un seul mot (« ${u} ») : personne, service ou lieu ? À vérifier` };
}

// Trouve ou crée une structure (par niveau et nom, sans tenir compte de la casse)
export async function structure(db, niveau, nom, parentId = null) {
  const { rows } = await db.query(
    "SELECT id FROM structures_sanitaires WHERE niveau = $1 AND upper(nom) = upper($2)", [niveau, nom]);
  if (rows.length) return rows[0].id;
  const r = await db.query(
    "INSERT INTO structures_sanitaires (niveau, nom, parent_id) VALUES ($1, $2, $3) RETURNING id", [niveau, nom, parentId]);
  return r.rows[0].id;
}

// Reprise : classe les équipements non classés et alimente le référentiel à partir des données
export async function amorcerClassement(db) {
  const { rows } = await db.query(
    "SELECT id, utilisateur, site, direction FROM equipements WHERE type_beneficiaire IS NULL");
  for (const e of rows) {
    const p = proposer(e);
    let structureId = null;
    if (p.district) structureId = await structure(db, "district", p.district);
    if (p.site) structureId = await structure(db, "site", p.site, structureId);
    await db.query(
      `UPDATE equipements SET type_beneficiaire = $2, structure_id = $3, classement_raison = $4, classement_valide = false
        WHERE id = $1`, [e.id, p.type, structureId, p.raison]);
    await db.query(
      "UPDATE attributions SET type_beneficiaire = $2, structure_id = $3 WHERE equipement_id = $1 AND en_cours",
      [e.id, p.type, structureId]);
  }
  return rows.length;
}

// ---------- Noms écrits de plusieurs façons ----------

const TITRES = new Set(["DR", "MME", "MLLE", "M", "MR", "EPSE", "EP", "NEE", "EPOUSE"]);
export const jetons = nom => propre(nom).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^A-Z0-9' ]/g, " ").split(/\s+/).map(t => t.replace(/'/g, "")).filter(t => t && !TITRES.has(t));

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Écritures phonétiques courantes : CHEIKH = CHEICK, KHADER = KADHER, ZILLE = ZILE
const sonore = t => t.replace(/CK|KH|QU|C(?=[AOU])/g, "K").replace(/PH/g, "F").replace(/([A-Z])H/g, "$1").replace(/(.)\1+/g, "$1");
const proches = (x, y) => x === y || sonore(x) === sonore(y) || (x.length >= 5 && distance(x, y) <= 1) ||
  (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));

// Vrai si chaque mot du nom le plus court (2 mots au moins) correspond à un mot différent de l'autre nom
export function memePersonne(a, b) {
  let [c, l] = [jetons(a), jetons(b)];
  if (c.length > l.length) [c, l] = [l, c];
  if (c.length < 2) return false;
  const pris = new Set();
  return c.every(t => {
    const i = l.findIndex((x, k) => !pris.has(k) && proches(t, x));
    if (i < 0) return false;
    pris.add(i);
    return true;
  });
}

// Regroupe les noms qui semblent désigner la même personne : [[{ nom, nb }], …]
export function groupesDeNoms(noms) {
  const parent = noms.map((_, i) => i);
  const racine = i => (parent[i] === i ? i : (parent[i] = racine(parent[i])));
  for (let i = 0; i < noms.length; i++)
    for (let j = i + 1; j < noms.length; j++)
      if (memePersonne(noms[i].nom, noms[j].nom)) parent[racine(j)] = racine(i);
  const groupes = {};
  noms.forEach((n, i) => (groupes[racine(i)] ||= []).push(n));
  return Object.values(groupes).filter(g => g.length > 1)
    .map(g => g.sort((a, b) => b.nb - a.nb || b.nom.length - a.nom.length));
}
