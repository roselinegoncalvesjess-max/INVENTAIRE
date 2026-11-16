import { useEffect, useState } from "react";
import { apiAuth } from "../api.js";
import Icone from "./Icone.jsx";

// Écran d'accès : création du premier administrateur, connexion ou changement du mot de passe provisoire
export default function Connexion({ utilisateur, onConnecte }) {
  const [etat, setEtat] = useState(null); // { configure, local, longueurMin }
  const [erreurServeur, setErreurServeur] = useState(false);

  useEffect(() => {
    if (utilisateur) return;
    let t;
    const lire = () => apiAuth.etat()
      .then(e => { setEtat(e); setErreurServeur(false); })
      .catch(() => { setErreurServeur(true); t = setTimeout(lire, 5000); });
    lire();
    return () => clearTimeout(t);
  }, [utilisateur]);

  return (
    <div className="ecran-acces">
      <div className="acces-carte">
        <div className="acces-logo">
          <span className="logo-mark"><Icone nom="inventaire" taille={22} /></span>
          <div><b>Parc IT</b><small>LHSPLA · Inventaire du matériel</small></div>
        </div>
        {utilisateur?.doitChanger ? (
          <>
            <div><h1>Choisissez votre mot de passe</h1>
              <p className="muted">Bonjour {utilisateur.nom}. Votre mot de passe actuel est provisoire : remplacez-le pour continuer.</p></div>
            <ChangerMotDePasse longueurMin={10} onFait={onConnecte} />
          </>
        ) : erreurServeur ? (
          <p className="notice">Serveur injoignable, nouvel essai automatique toutes les 5 secondes.</p>
        ) : !etat ? (
          <p className="muted">Connexion au serveur…</p>
        ) : !etat.configure && etat.local ? (
          <PremierAdmin longueurMin={etat.longueurMin} onConnecte={onConnecte} />
        ) : !etat.configure ? (
          <p className="notice">L’application n’est pas encore configurée : le premier compte administrateur doit être créé sur le poste qui l’héberge, à l’adresse http://localhost:3001.</p>
        ) : (
          <FormConnexion onConnecte={onConnecte} />
        )}
      </div>
    </div>
  );
}

function FormConnexion({ onConnecte }) {
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const soumettre = async ev => {
    ev.preventDefault();
    if (!identifiant.trim() || !motDePasse) { setErreur("Saisissez votre identifiant et votre mot de passe."); return; }
    setEnvoi(true); setErreur("");
    try { onConnecte(await apiAuth.connexion(identifiant.trim(), motDePasse)); }
    catch (e) { setErreur(e.message); setMotDePasse(""); }
    finally { setEnvoi(false); }
  };

  return (
    <form className="pile" onSubmit={soumettre} noValidate>
      <div><h1>Connexion</h1><p className="muted">Utilisez le compte fourni par l’administrateur de l’application.</p></div>
      <label className="field"><span className="label">Identifiant</span>
        <input value={identifiant} onChange={e => setIdentifiant(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus /></label>
      <label className="field"><span className="label">Mot de passe</span>
        <input type="password" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} autoComplete="current-password" /></label>
      {erreur && <p className="notice" role="alert">{erreur}</p>}
      <button className="btn primary plein" disabled={envoi}>{envoi ? "Connexion…" : "Se connecter"}</button>
      <p className="muted petit-texte">Mot de passe oublié : demandez à un administrateur de le réinitialiser.</p>
    </form>
  );
}

function PremierAdmin({ longueurMin, onConnecte }) {
  const [f, setF] = useState({ nom: "", identifiant: "", motDePasse: "", confirmation: "" });
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const champ = k => e => setF(v => ({ ...v, [k]: e.target.value }));

  const soumettre = async ev => {
    ev.preventDefault();
    if (f.motDePasse !== f.confirmation) { setErreur("Les deux mots de passe ne correspondent pas."); return; }
    setEnvoi(true); setErreur("");
    try { onConnecte(await apiAuth.initialiser({ nom: f.nom, identifiant: f.identifiant, motDePasse: f.motDePasse })); }
    catch (e) { setErreur(e.message); }
    finally { setEnvoi(false); }
  };

  return (
    <form className="pile" onSubmit={soumettre} noValidate>
      <div><h1>Créer le compte administrateur</h1>
        <p className="muted">Première utilisation : ce compte pourra ensuite créer les comptes des autres personnes.</p></div>
      <label className="field"><span className="label">Nom et prénoms</span>
        <input value={f.nom} onChange={champ("nom")} autoFocus /></label>
      <label className="field"><span className="label">Identifiant de connexion</span>
        <input value={f.identifiant} onChange={champ("identifiant")} autoComplete="username" autoCapitalize="none" placeholder="ex. admin" /></label>
      <label className="field"><span className="label">Mot de passe ({longueurMin} caractères minimum)</span>
        <input type="password" value={f.motDePasse} onChange={champ("motDePasse")} autoComplete="new-password" /></label>
      <label className="field"><span className="label">Confirmation</span>
        <input type="password" value={f.confirmation} onChange={champ("confirmation")} autoComplete="new-password" /></label>
      {erreur && <p className="notice" role="alert">{erreur}</p>}
      <button className="btn primary plein" disabled={envoi}>{envoi ? "Création…" : "Créer et se connecter"}</button>
    </form>
  );
}

export function ChangerMotDePasse({ longueurMin = 10, onFait, onAnnuler }) {
  const [f, setF] = useState({ actuel: "", nouveau: "", confirmation: "" });
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const champ = k => e => setF(v => ({ ...v, [k]: e.target.value }));

  const soumettre = async ev => {
    ev.preventDefault();
    if (f.nouveau.length < longueurMin) { setErreur(`Le nouveau mot de passe doit contenir au moins ${longueurMin} caractères.`); return; }
    if (f.nouveau !== f.confirmation) { setErreur("Les deux nouveaux mots de passe ne correspondent pas."); return; }
    setEnvoi(true); setErreur("");
    try { onFait(await apiAuth.changerMotDePasse(f.actuel, f.nouveau)); }
    catch (e) { setErreur(e.message); }
    finally { setEnvoi(false); }
  };

  return (
    <form className="pile" onSubmit={soumettre} noValidate>
      <label className="field"><span className="label">Mot de passe actuel</span>
        <input type="password" value={f.actuel} onChange={champ("actuel")} autoComplete="current-password" autoFocus /></label>
      <label className="field"><span className="label">Nouveau mot de passe ({longueurMin} caractères minimum)</span>
        <input type="password" value={f.nouveau} onChange={champ("nouveau")} autoComplete="new-password" /></label>
      <label className="field"><span className="label">Confirmation</span>
        <input type="password" value={f.confirmation} onChange={champ("confirmation")} autoComplete="new-password" /></label>
      {erreur && <p className="notice" role="alert">{erreur}</p>}
      <div className="toolbar" style={{ justifyContent: "flex-end" }}>
        {onAnnuler && <button type="button" className="btn" onClick={onAnnuler}>Annuler</button>}
        <button className="btn primary" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer le mot de passe"}</button>
      </div>
    </form>
  );
}
