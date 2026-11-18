// Appels à l'API REST du serveur Node.js (le cookie de session part automatiquement)
const BASE = "/api/decharges";

// Appelée quand le serveur répond 401 (session expirée ou compte désactivé)
let surDeconnexion = () => {};
export const quandDeconnecte = fn => { surDeconnexion = fn; };

async function requete(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try { message = (await res.json()).message || message; } catch { /* réponse sans JSON */ }
    const erreur = new Error(message);
    erreur.status = res.status;
    if (res.status === 401 && !url.startsWith("/api/auth/")) surDeconnexion();
    throw erreur;
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  lister: () => requete("GET", BASE),
  creer: data => requete("POST", BASE, data),
  modifier: (id, data) => requete("PUT", `${BASE}/${id}`, data),
  supprimer: id => requete("DELETE", `${BASE}/${id}`),
  urlExportInventaire: `${BASE}/export/inventaire`,
  urlExportDecharges: `${BASE}/export/decharges`
};

// Registre du parc et inventaire physique
const EQ = "/api/equipements";
export const apiEquipements = {
  lister: () => requete("GET", EQ),
  releves: id => requete("GET", `${EQ}/${id}/releves`),
  tousReleves: () => requete("GET", `${EQ}/releves`),
  inventorier: (id, data) => requete("PUT", `${EQ}/${id}/inventaire`, data),
  redater: (releveId, date) => requete("PUT", `${EQ}/releves/${releveId}`, { date }),
  redaterLot: (de, vers, tous) => requete("POST", `${EQ}/releves/redater`, { de, vers, tous }),
  ajouter: data => requete("POST", EQ, data),
  attributions: id => requete("GET", `${EQ}/${id}/attributions`),
  toutesAttributions: () => requete("GET", `${EQ}/attributions`),
  reattribuer: (id, data) => requete("POST", `${EQ}/${id}/attributions`, data),
  urlExport: `${EQ}/export`
};

// Connexion et compte
export const apiAuth = {
  etat: () => requete("GET", "/api/auth/etat"),
  moi: () => requete("GET", "/api/auth/moi"),
  connexion: (identifiant, motDePasse) => requete("POST", "/api/auth/connexion", { identifiant, motDePasse }),
  initialiser: data => requete("POST", "/api/auth/initialiser", data),
  deconnexion: () => requete("POST", "/api/auth/deconnexion"),
  changerMotDePasse: (actuel, nouveau) => requete("PUT", "/api/auth/mot-de-passe", { actuel, nouveau })
};

// Gestion des comptes (administrateurs)
export const apiUtilisateurs = {
  lister: () => requete("GET", "/api/utilisateurs"),
  creer: data => requete("POST", "/api/utilisateurs", data),
  modifier: (id, data) => requete("PUT", `/api/utilisateurs/${id}`, data),
  reinitialiser: id => requete("POST", `/api/utilisateurs/${id}/reinitialiser`)
};

export const MOTIFS_ATTRIBUTION = [
  "Départ de l'utilisateur", "Mutation / changement de service", "Remplacement de matériel",
  "Nouvel arrivant", "Prêt temporaire", "Retour en stock", "Correction du registre", "Autre"
];
export const RETOUR_STOCK = "Retour en stock";

export const ROLES = { admin: "Administrateur", agent: "Agent d’inventaire", lecteur: "Lecture seule" };

// Classement par type de bénéficiaire, noms en double
export const apiClassement = {
  classer: (ids, type, structureId) => requete("PUT", "/api/classement", { ids, type, structureId }),
  doublons: () => requete("GET", "/api/classement/doublons"),
  fusionner: (noms, nom) => requete("POST", "/api/classement/fusionner", { noms, nom })
};

// Référentiel des structures sanitaires (régions → districts → sites)
export const apiStructures = {
  lister: () => requete("GET", "/api/structures"),
  creer: data => requete("POST", "/api/structures", data),
  modifier: (id, data) => requete("PUT", `/api/structures/${id}`, data),
  supprimer: id => requete("DELETE", `/api/structures/${id}`)
};
