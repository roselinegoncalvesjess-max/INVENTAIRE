import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClassement, apiStructures } from "../api.js";
import { NIVEAU_DU_TYPE, NIVEAUX, TYPES_BENEFICIAIRE } from "../utils.js";

// Pastille colorée du type de bénéficiaire
export function PastilleType({ type, court }) {
  const t = TYPES_BENEFICIAIRE[type];
  if (!t) return <span className="chip">Non classé</span>;
  return <span className="chip type-b" style={{ "--c": t.couleur }}>{court ? t.court : t.libelle}</span>;
}

// Chemin « Région › District › Site » d'un équipement ou d'une structure
export const cheminStructure = e => [e.region, e.district, e.siteSanitaire].filter(Boolean).join(" › ");

// Charge le référentiel ; recharger() après une création
export function useStructures() {
  const [structures, setStructures] = useState([]);
  const recharger = useCallback(() => apiStructures.lister().then(setStructures).catch(() => setStructures([])), []);
  useEffect(() => { recharger(); }, [recharger]);
  return [structures, recharger];
}

// Libellé complet d'une structure avec ses parents
export function libelleStructure(s, parId) {
  const noms = [];
  for (let x = s; x; x = parId[x.parentId]) noms.unshift(x.nom);
  return noms.join(" › ");
}

// Liste déroulante des structures d'un niveau, avec création rapide
export function ChoixStructure({ niveau, valeur, onChange, structures, onCree }) {
  const parId = useMemo(() => Object.fromEntries(structures.map(s => [s.id, s])), [structures]);
  const options = useMemo(() => structures.filter(s => s.niveau === niveau)
    .map(s => ({ ...s, libelle: libelleStructure(s, parId) }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")), [structures, niveau, parId]);
  const [ajout, setAjout] = useState(false);

  return (
    <div className="pile-serree">
      <label className="field"><span className="label">{NIVEAUX[niveau]} *</span>
        <select value={valeur || ""} onChange={ev => onChange(Number(ev.target.value) || null)}>
          <option value="">— Choisir —</option>
          {options.map(s => <option key={s.id} value={s.id}>{s.libelle}</option>)}
        </select></label>
      {ajout ? (
        <NouvelleStructure niveau={niveau} structures={structures}
          onAnnuler={() => setAjout(false)}
          onCree={async id => { setAjout(false); await onCree?.(); onChange(id); }} />
      ) : (
        <button type="button" className="btn petit lien-btn" onClick={() => setAjout(true)}>
          + {niveau === "site" ? "Nouveau site" : niveau === "district" ? "Nouveau district" : "Nouvelle région"} absent de la liste
        </button>
      )}
    </div>
  );
}

const PARENT = { site: "district", district: "region", region: null };

// Petit formulaire de création d'une structure (dans un autre formulaire : pas de <form> imbriqué)
export function NouvelleStructure({ niveau, structures, onCree, onAnnuler, parentInitial }) {
  const [nom, setNom] = useState("");
  const [parentId, setParentId] = useState(parentInitial || "");
  const [erreur, setErreur] = useState("");
  const niveauParent = PARENT[niveau];
  const parents = structures.filter(s => s.niveau === niveauParent).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const creer = async () => {
    if (!nom.trim()) { setErreur("Indiquez le nom."); return; }
    try {
      const { id } = await apiStructures.creer({ niveau, nom, parentId: parentId || null });
      await onCree(id);
    } catch (ex) { setErreur(ex.message); }
  };

  return (
    <div className="encart">
      <div className="grid">
        <label className="field"><span className="label">Nom du {NIVEAUX[niveau].toLowerCase()}</span>
          <input value={nom} onChange={ev => setNom(ev.target.value)} autoFocus
            placeholder={niveau === "site" ? "ex. CSR KOFFIKRO" : niveau === "district" ? "ex. DS BOUAFLE" : "ex. MARAHOUE"}
            onKeyDown={ev => { if (ev.key === "Enter") { ev.preventDefault(); creer(); } }} /></label>
        {niveauParent && (
          <label className="field"><span className="label">{NIVEAUX[niveauParent]} de rattachement</span>
            <select value={parentId} onChange={ev => setParentId(ev.target.value)}>
              <option value="">— À préciser plus tard —</option>
              {parents.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select></label>
        )}
      </div>
      {erreur && <p className="hint">{erreur}</p>}
      <div className="toolbar">
        <button type="button" className="btn petit" onClick={onAnnuler}>Annuler</button>
        <button type="button" className="btn petit primary" onClick={creer}>Créer</button>
      </div>
    </div>
  );
}

// Choix du type puis, pour une structure sanitaire, de la structure
export function ChoixType({ type, onType, exclure = [] }) {
  return (
    <div className="segment types" role="radiogroup" aria-label="Type de bénéficiaire">
      {Object.entries(TYPES_BENEFICIAIRE).filter(([k]) => !exclure.includes(k)).map(([k, t]) => (
        <label key={k} className={type === k ? "on" : ""} style={{ "--c": t.couleur }}>
          <input type="radio" name="typeBeneficiaire" value={k} checked={type === k} onChange={() => onType(k)} />
          <span className="pastille" />{t.libelle}
        </label>
      ))}
    </div>
  );
}

// Fenêtre « Classer » : un ou plusieurs équipements → type (+ structure)
export function FenetreClasser({ ids, typeInitial, structureInitiale, titre, onFait, onFermer }) {
  const [structures, recharger] = useStructures();
  const [type, setType] = useState(typeInitial || "");
  const [structureId, setStructureId] = useState(structureInitiale || null);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const niveau = NIVEAU_DU_TYPE[type];

  useEffect(() => {
    const echap = ev => ev.key === "Escape" && onFermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [onFermer]);

  // Une structure d'un autre niveau ne convient plus quand le type change
  useEffect(() => {
    if (structureId && niveau && !structures.some(s => s.id === structureId && s.niveau === niveau)) setStructureId(null);
  }, [niveau, structures, structureId]);

  const valider = async () => {
    if (!type) { setErreur("Choisissez le type de bénéficiaire."); return; }
    if (niveau && !structureId) { setErreur("Choisissez la structure sanitaire."); return; }
    setEnvoi(true); setErreur("");
    try {
      const r = await apiClassement.classer(ids, type, niveau ? structureId : null);
      await onFait(r.modifies, type);
    } catch (ex) { setErreur("Enregistrement impossible : " + ex.message); setEnvoi(false); }
  };

  return (
    <div className="overlay" onClick={ev => ev.target === ev.currentTarget && onFermer()}>
      <div className="card petite-moyenne" role="dialog" aria-modal="true" aria-labelledby="clTitre">
        <div className="formhead">
          <div style={{ display: "grid", gap: 4 }}>
            <span className="label">Classement</span>
            <h2 id="clTitre">{titre || `${ids.length} équipement(s)`}</h2>
          </div>
        </div>
        <fieldset>
          <legend><span className="n">1</span> Type de bénéficiaire</legend>
          <ChoixType type={type} onType={setType} />
        </fieldset>
        {niveau && (
          <fieldset>
            <legend><span className="n">2</span> Structure</legend>
            <ChoixStructure niveau={niveau} valeur={structureId} onChange={setStructureId} structures={structures} onCree={recharger} />
          </fieldset>
        )}
        {erreur && <p className="notice" style={{ margin: 0 }}>{erreur}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button type="button" className="btn primary" disabled={envoi} onClick={valider}>{envoi ? "Enregistrement…" : "Valider le classement"}</button>
        </div>
      </div>
    </div>
  );
}
