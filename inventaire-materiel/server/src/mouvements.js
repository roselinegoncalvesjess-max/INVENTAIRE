// Mouvements d'un équipement en dehors de l'inventaire physique :
// déplacement, réparation, prêt, panne, perte/vol, remise en service, réforme, correction de fiche.
import { CHAMPS_EQUIPEMENT, ETATS } from "./validation.js";

// statut : statut appliqué à la fiche · etat : état physique proposé · ouvre / ferme : sortie temporaire
export const TYPES_MOUVEMENT = {
  deplacement:       { libelle: "Déplacement", champs: ["site", "direction", "emplacement"] },
  reparation:        { libelle: "Envoi en réparation", statut: "En réparation", ouvre: true, champs: ["etatPhysique"] },
  retour_reparation: { libelle: "Retour de réparation", statut: "En service", ferme: "reparation", champs: ["etatPhysique"] },
  pret:              { libelle: "Prêt temporaire", ouvre: true },
  retour_pret:       { libelle: "Retour de prêt", ferme: "pret", champs: ["etatPhysique"] },
  panne:             { libelle: "Panne", statut: "Hors service", etat: "Défaillant", champs: ["etatPhysique"] },
  perte_vol:         { libelle: "Perte ou vol", statut: "Volé ou perdu" },
  remise_service:    { libelle: "Remise en service", statut: "En service", champs: ["etatPhysique"] },
  reforme:           { libelle: "Réforme (sortie du parc)", statut: "Réformé", etat: "Hors d'usage" },
  correction:        { libelle: "Correction de la fiche", champs: ["descriptif", "type", "categorie", "numeroFiche", "identifiant",
                         "referenceSerie", "accessoires", "valeurAcquisition", "dateDebut", "observation"] }
};

// Champs modifiables par un mouvement : nom API → [colonne SQL, genre]
const CHAMPS = { ...CHAMPS_EQUIPEMENT, etatPhysique: ["etat_physique", "texte"] };

const texte = v => (typeof v === "string" ? v.trim() : "");
const optionnel = v => texte(v) || null;
const estDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const aujourdhuiLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

// Nettoie et valide un mouvement. Renvoie { erreur } ou { donnees }.
export function validerMouvement(body = {}) {
  const type = texte(body.type);
  const t = TYPES_MOUVEMENT[type];
  if (!t) return { erreur: "Choisissez le type de mouvement." };
  const date = texte(body.date);
  if (!estDate(date)) return { erreur: "La date du mouvement est obligatoire." };
  if (date > aujourdhuiLocal()) return { erreur: "La date ne peut pas être dans le futur." };

  const d = {
    type, date,
    motif: optionnel(body.motif), commentaire: optionnel(body.commentaire), piece: optionnel(body.piece),
    destinataire: optionnel(body.destinataire), retourPrevu: optionnel(body.retourPrevu), champs: {}
  };
  for (const [k, max] of [["motif", 150], ["piece", 120], ["destinataire", 150]])
    if (d[k] && d[k].length > max) return { erreur: "Un des textes saisis est trop long." };
  if (type === "pret") {
    if (!d.destinataire) return { erreur: "Indiquez à qui l'équipement est prêté." };
    if (!d.retourPrevu || !estDate(d.retourPrevu)) return { erreur: "Indiquez la date de retour prévue." };
    if (d.retourPrevu < date) return { erreur: "Le retour prévu ne peut pas précéder le prêt." };
  } else if (type === "reparation") {
    if (!d.destinataire) return { erreur: "Indiquez le prestataire ou le service qui répare." };
    if (d.retourPrevu && (!estDate(d.retourPrevu) || d.retourPrevu < date)) return { erreur: "Date de retour prévue invalide." };
  } else {
    d.destinataire = null; d.retourPrevu = null;
  }

  for (const cle of t.champs || []) {
    if (!(cle in (body.champs || {}))) continue;
    const brut = body.champs[cle];
    const genre = CHAMPS[cle][1];
    if (genre === "nombre") {
      if (brut === null || brut === "") { d.champs[cle] = null; continue; }
      const n = Number(String(brut).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return { erreur: "La valeur d'acquisition doit être un nombre positif." };
      d.champs[cle] = n;
    } else if (genre === "date") {
      const v = optionnel(brut);
      if (v && !estDate(v)) return { erreur: "La date d'acquisition est invalide." };
      d.champs[cle] = v;
    } else {
      const v = optionnel(brut);
      if (v && v.length > 300) return { erreur: "Un des champs saisis est trop long." };
      d.champs[cle] = v;
    }
  }
  if (d.champs.etatPhysique && !ETATS.includes(d.champs.etatPhysique)) return { erreur: "État physique inconnu." };
  if ("descriptif" in d.champs && !d.champs.descriptif) return { erreur: "Le descriptif de l'équipement est obligatoire." };
  // Le statut et l'état découlent du type de mouvement
  if (t.statut) d.champs.statut = t.statut;
  if (t.etat && !d.champs.etatPhysique) d.champs.etatPhysique = t.etat;
  return { donnees: d };
}

// Enregistre le mouvement et met la fiche à jour. Renvoie { statut, message? }.
export async function appliquerMouvement(client, equipementId, d, auteur) {
  const { rows } = await client.query("SELECT * FROM equipements WHERE id = $1 FOR UPDATE", [equipementId]);
  if (!rows.length) return { statut: 404, message: "Équipement introuvable." };
  const avant = rows[0];
  const t = TYPES_MOUVEMENT[d.type];

  const { rows: ouvertes } = await client.query(
    `SELECT id, type, date_mouvement, destinataire FROM mouvements
      WHERE equipement_id = $1 AND clos_le IS NULL AND type IN ('pret', 'reparation') ORDER BY id DESC`, [equipementId]);
  const sortie = ouvertes[0];
  const LIB = { pret: "en prêt", reparation: "en réparation" };
  if (t.ouvre && sortie)
    return { statut: 400, message: `L'équipement est déjà ${LIB[sortie.type]} (${sortie.destinataire}) : enregistrez d'abord son retour.` };
  if (t.ferme && sortie?.type !== t.ferme)
    return { statut: 400, message: t.ferme === "pret" ? "Aucun prêt en cours pour cet équipement." : "L'équipement n'est pas en réparation." };
  if (t.ferme && d.date < sortie.date_mouvement)
    return { statut: 400, message: "Le retour ne peut pas précéder la sortie." };
  if (d.type === "reforme" && sortie)
    return { statut: 400, message: `L'équipement est ${LIB[sortie.type]} : enregistrez d'abord son retour.` };
  if (avant.statut === "Réformé" && d.type !== "correction")
    return { statut: 400, message: "Cet équipement est réformé : seule une correction de la fiche est possible." };

  const sets = [], valeurs = [equipementId], modifications = {};
  for (const [cle, val] of Object.entries(d.champs)) {
    const col = CHAMPS[cle][0];
    const ancien = avant[col] ?? null;
    if (ancien === val || (ancien !== null && val !== null && String(ancien) === String(val))) continue;
    modifications[cle] = { avant: ancien, apres: val };
    valeurs.push(val);
    sets.push(`${col} = $${valeurs.length}`);
  }
  if ((d.type === "deplacement" || d.type === "correction") && !sets.length)
    return { statut: 400, message: "Aucune information n'a changé." };
  if (sets.length) await client.query(`UPDATE equipements SET ${sets.join(", ")}, modifie_le = now() WHERE id = $1`, valeurs);

  const { rows: cree } = await client.query(
    `INSERT INTO mouvements (equipement_id, type, date_mouvement, destinataire, retour_prevu, motif, commentaire, piece,
                             modifications, saisi_par, utilisateur_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [equipementId, d.type, d.date, d.destinataire, d.retourPrevu, d.motif, d.commentaire, d.piece,
     modifications, auteur.nom, auteur.id]);
  if (t.ferme)
    await client.query("UPDATE mouvements SET clos_le = $2, clos_par_id = $3 WHERE id = $1", [sortie.id, d.date, cree[0].id]);
  return { statut: 201 };
}
