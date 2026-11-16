import { useCallback, useEffect, useState } from "react";
import { apiUtilisateurs, ROLES } from "../api.js";
import { fmtDate } from "../utils.js";
import Icone from "./Icone.jsx";
import { PageTete } from "./Commun.jsx";

const DESCRIPTIONS = {
  admin: "Tout faire, y compris gérer les comptes",
  agent: "Saisir les constats d’inventaire et les décharges",
  lecteur: "Consulter et exporter, sans rien modifier"
};

// Gestion des comptes : création, rôle, désactivation, réinitialisation du mot de passe
export default function Utilisateurs({ moi, onToast }) {
  const [comptes, setComptes] = useState([]);
  const [erreur, setErreur] = useState("");
  const [form, setForm] = useState({ nom: "", identifiant: "", role: "agent" });
  const [envoi, setEnvoi] = useState(false);
  const [secret, setSecret] = useState(null); // { nom, identifiant, motDePasse } affiché une seule fois

  const charger = useCallback(() => apiUtilisateurs.lister().then(setComptes).catch(e => setErreur(e.message)), []);
  useEffect(() => { charger(); }, [charger]);

  const creer = async ev => {
    ev.preventDefault();
    setEnvoi(true); setErreur("");
    try {
      const r = await apiUtilisateurs.creer(form);
      setSecret({ nom: r.utilisateur.nom, identifiant: r.utilisateur.identifiant, motDePasse: r.motDePasseProvisoire });
      setForm({ nom: "", identifiant: "", role: "agent" });
      await charger();
    } catch (e) { setErreur(e.message); }
    finally { setEnvoi(false); }
  };

  const modifier = async (u, data, message) => {
    setErreur("");
    try { await apiUtilisateurs.modifier(u.id, data); onToast(message); await charger(); }
    catch (e) { setErreur(e.message); }
  };

  const reinitialiser = async u => {
    setErreur("");
    try {
      const r = await apiUtilisateurs.reinitialiser(u.id);
      setSecret({ nom: u.nom, identifiant: u.identifiant, motDePasse: r.motDePasseProvisoire });
      await charger();
    } catch (e) { setErreur(e.message); }
  };

  return (
    <div className="pile">
      <PageTete icone="utilisateur" titre="Utilisateurs" sous="Comptes autorisés à se connecter à l’application" />

      {secret && (
        <section className="secret" role="status">
          <div>
            <b>Mot de passe provisoire de {secret.nom}</b>
            <p className="muted">Transmettez-le à la personne (en main propre ou par téléphone). Il ne sera plus affiché ; elle devra le changer à sa première connexion.</p>
          </div>
          <div className="secret-valeur">
            <span className="mono">Identifiant : {secret.identifiant}</span>
            <span className="mono"><b>{secret.motDePasse}</b></span>
          </div>
          <div className="toolbar">
            <button className="btn" onClick={() => navigator.clipboard?.writeText(secret.motDePasse).then(() => onToast("Mot de passe copié"))}>
              <Icone nom="copier" taille={16} />Copier</button>
            <button className="btn primary" onClick={() => setSecret(null)}>C’est transmis</button>
          </div>
        </section>
      )}

      <form className="filtres" onSubmit={creer} noValidate>
        <label className="field grand"><span className="label">Nom et prénoms</span>
          <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="ex. KOUAME Ange" /></label>
        <label className="field"><span className="label">Identifiant</span>
          <input value={form.identifiant} autoCapitalize="none" placeholder="ex. akouame"
            onChange={e => setForm(f => ({ ...f, identifiant: e.target.value.toLowerCase().replace(/\s/g, "") }))} /></label>
        <label className="field"><span className="label">Rôle</span>
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <button className="btn primary" disabled={envoi}><Icone nom="plus" taille={16} />Créer le compte</button>
        <p className="muted petit-texte" style={{ flexBasis: "100%" }}>{DESCRIPTIONS[form.role]}. Un mot de passe provisoire est généré à la création.</p>
      </form>

      {erreur && <p className="notice" role="alert">{erreur}</p>}

      <section className="panneau sans-marge">
        <div className="tableau-tete"><span className="muted">{comptes.length} compte(s)</span></div>
        <div className="tablebox nu">
          <table>
            <thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>État</th><th>Dernière connexion</th><th>Actions</th></tr></thead>
            <tbody>
              {comptes.map(u => {
                const soi = u.id === moi.id;
                return (
                  <tr key={u.id} className={u.actif ? "" : "inactif"}>
                    <td><b>{u.nom}</b>{soi && <span className="muted"> (vous)</span>}</td>
                    <td className="mono">{u.identifiant}</td>
                    <td>
                      <select value={u.role} disabled={soi} aria-label={`Rôle de ${u.nom}`}
                        onChange={e => modifier(u, { role: e.target.value }, `${u.nom} : ${ROLES[e.target.value]}`)}>
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td>
                      {!u.actif ? <span className="chip">Désactivé</span>
                        : u.doitChanger ? <span className="chip ex">Mot de passe provisoire</span>
                          : <span className="chip ok">Actif</span>}
                    </td>
                    <td className="mono">{u.derniereConnexion ? fmtDate(u.derniereConnexion) : "Jamais"}</td>
                    <td>
                      <div className="toolbar">
                        <button className="btn petit" onClick={() => reinitialiser(u)} disabled={soi}
                          title={soi ? "Changez votre mot de passe depuis le menu" : ""}>Réinitialiser le mot de passe</button>
                        {!soi && (u.actif
                          ? <button className="btn petit danger" onClick={() => modifier(u, { actif: false }, `${u.nom} désactivé`)}>Désactiver</button>
                          : <button className="btn petit" onClick={() => modifier(u, { actif: true }, `${u.nom} réactivé`)}>Réactiver</button>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
