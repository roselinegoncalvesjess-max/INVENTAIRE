// Vérifie un IMEI : 15 chiffres et clé de contrôle (algorithme de Luhn)
export function imeiValide(imei) {
  if (!/^\d{15}$/.test(imei)) return false;
  let somme = 0;
  for (let i = 0; i < 15; i++) {
    let c = Number(imei[14 - i]);
    if (i % 2 === 1) { c *= 2; if (c > 9) c -= 9; }
    somme += c;
  }
  return somme % 10 === 0;
}

const texte = v => (typeof v === "string" ? v.trim() : "");
const optionnel = v => texte(v) || null;

// Nettoie et valide une décharge reçue de l'interface.
// Renvoie { erreur } ou { donnees }.
export function validerDecharge(body = {}) {
  const dateRemise = texte(body.dateRemise);
  const structure = texte(body.structure);
  const beneficiaireNom = texte(body.beneficiaireNom);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRemise)) return { erreur: "La date de remise est obligatoire." };
  if (!structure) return { erreur: "La structure bénéficiaire est obligatoire." };
  if (!beneficiaireNom) return { erreur: "Le nom du bénéficiaire est obligatoire." };
  if (!Array.isArray(body.articles) || body.articles.length === 0)
    return { erreur: "Ajoutez au moins un équipement." };

  const articles = [];
  for (const a of body.articles) {
    const designation = texte(a.designation);
    if (!designation) return { erreur: "Chaque équipement doit avoir une désignation." };
    const imei = optionnel(a.imei);
    if (imei && !imeiValide(imei)) return { erreur: `L'IMEI ${imei} est invalide (15 chiffres avec clé de contrôle).` };
    articles.push({
      designation,
      quantite: Math.max(1, parseInt(a.quantite, 10) || 1),
      identifiant: optionnel(a.identifiant),
      imei,
      numeroSerie: optionnel(a.numeroSerie)
    });
  }

  return {
    donnees: {
      dateRemise,
      structure,
      beneficiaireNom,
      beneficiaireTelephone: optionnel(body.beneficiaireTelephone),
      beneficiaireFonction: optionnel(body.beneficiaireFonction),
      articles
    }
  };
}

// ---------- Inventaire physique ----------

export const CONSTATS = ["Présent", "Absent", "Volé ou perdu"];
export const ETATS = ["Bon état", "Usagé", "Défaillant", "Hors d'usage"];
export const STATUTS = ["En service", "Pas encore en service", "Inactif", "Hors service"];

// Champs du registre que l'agent peut compléter ou corriger : nom API → [colonne SQL, genre]
export const CHAMPS_EQUIPEMENT = {
  numeroFiche:       ["numero_fiche", "texte"],
  identifiant:       ["identifiant", "texte"],
  type:              ["type", "texte"],
  categorie:         ["categorie", "texte"],
  descriptif:        ["descriptif", "texte"],
  referenceSerie:    ["reference_serie", "texte"],
  accessoires:       ["accessoires", "texte"],
  valeurAcquisition: ["valeur_acquisition", "nombre"],
  dateDebut:         ["date_debut", "date"],
  utilisateur:       ["utilisateur", "texte"],
  site:              ["site", "texte"],
  direction:         ["direction", "texte"],
  emplacement:       ["emplacement", "texte"],
  statut:            ["statut", "texte"],
  observation:       ["observation", "texte"]
};

const estDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Nettoie et valide un relevé d'inventaire physique.
// Renvoie { erreur } ou { donnees: { releve, champs } } ; seuls les champs envoyés sont modifiés.
export function validerReleve(body = {}) {
  const r = body.releve || {};
  const releve = {
    date: texte(r.date),
    agent: texte(r.agent),
    constat: texte(r.constat),
    etatPhysique: optionnel(r.etatPhysique),
    commentaire: optionnel(r.commentaire)
  };
  if (!estDate(releve.date)) return { erreur: "La date de l'inventaire est obligatoire." };
  if (!releve.agent) return { erreur: "Le nom de l'agent qui inventorie est obligatoire." };
  if (!CONSTATS.includes(releve.constat)) return { erreur: "Indiquez si l'équipement est présent, absent ou volé/perdu." };
  if (releve.etatPhysique && !ETATS.includes(releve.etatPhysique)) return { erreur: "État physique inconnu." };

  const champs = {};
  for (const [cle, [, genre]] of Object.entries(CHAMPS_EQUIPEMENT)) {
    if (!(cle in (body.champs || {}))) continue;
    const brut = body.champs[cle];
    if (genre === "nombre") {
      if (brut === null || brut === "") { champs[cle] = null; continue; }
      const n = Number(String(brut).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return { erreur: "La valeur d'acquisition doit être un nombre positif." };
      champs[cle] = n;
    } else if (genre === "date") {
      const d = optionnel(brut);
      if (d && !estDate(d)) return { erreur: "La date d'acquisition est invalide." };
      champs[cle] = d;
    } else {
      champs[cle] = optionnel(brut);
    }
  }
  if (champs.statut && !STATUTS.includes(champs.statut)) return { erreur: "Statut inconnu." };
  if ("descriptif" in champs && !champs.descriptif) return { erreur: "Le descriptif de l'équipement est obligatoire." };

  return { donnees: { releve, champs } };
}
