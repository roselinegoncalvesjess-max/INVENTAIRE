import { useEffect, useMemo, useState } from "react";
import { MOTIFS_ATTRIBUTION, RETOUR_STOCK } from "../api.js";
import { aujourdhui, fmtDate } from "../utils.js";
import Icone from "./Icone.jsx";
import { NIVEAU_DU_TYPE } from "../utils.js";
import { cheminStructure, ChoixStructure, ChoixType, PastilleType, useStructures } from "./Beneficiaires.jsx";

const ORIGINES = { import: "Repris du fichier Excel", inventaire: "Constaté à l’inventaire", saisie: "Réattribution" };

// Durée lisible entre deux dates ISO (fin absente = aujourd'hui)
export function duree(du, au) {
  if (!du) return "";
  const j = Math.round((Date.parse(au || aujourdhui()) - Date.parse(du)) / 86400000);
  if (j < 1) return "moins d’un jour";
  if (j < 60) return `${j} jour${j > 1 ? "s" : ""}`;
  const m = Math.round(j / 30.44);
  if (m < 24) return `${m} mois`;
  const a = Math.floor(m / 12), r = m % 12;
  return `${a} an${a > 1 ? "s" : ""}${r ? ` ${r} mois` : ""}`;
}

// Panneau de la fiche équipement : détenteur actuel et détenteurs successifs
export function PanneauDetenteurs({ equipement: e, attributions, peutModifier, onReattribuer }) {
  const actuelle = attributions.find(a => a.enCours);
  const anciennes = attributions.filter(a => !a.enCours);
  return (
    <section className="panneau">
      <h2 className="panneau-titre"><Icone nom="utilisateur" taille={16} />Détenteurs
        {e.nbDetenteurs > 1 && <span className="chip violet">Réattribué · {e.nbDetenteurs} détenteurs</span>}
      </h2>
      <div className="detenteur-actuel">
        <span className="avatar" aria-hidden="true">{e.utilisateur ? initiales(e.utilisateur) : <Icone nom="remis" taille={16} />}</span>
        <div>
          <span className="label">Détenteur actuel <PastilleType type={e.typeBeneficiaire} /></span>
          <b>{e.utilisateur || "En stock (non attribué)"}</b>
          {cheminStructure(e) && <span className="chemin">{cheminStructure(e)}</span>}
          {actuelle?.recuPar && <span className="muted petit-texte">Reçu par {actuelle.recuPar}</span>}
          <span className="muted petit-texte">
            {actuelle?.du ? `depuis le ${fmtDate(actuelle.du)} (${duree(actuelle.du)})` : "date d’attribution inconnue"}
            {[e.direction, e.site].filter(Boolean).length > 0 && ` · ${[e.direction, e.site].filter(Boolean).join(" · ")}`}
          </span>
        </div>
      </div>
      {peutModifier && (
        <button className="btn primary plein" onClick={onReattribuer}><Icone nom="utilisateur" taille={16} />Réattribuer</button>
      )}
      {anciennes.length > 0 ? (
        <>
          <span className="label">Détenteurs précédents</span>
          <ol className="frise detenteurs">
            {anciennes.map(a => (
              <li key={a.id}>
                <span className="mono muted">{a.du ? fmtDate(a.du) : "?"} → {a.au ? fmtDate(a.au) : "?"}
                  {a.du && a.au && <> · {duree(a.du, a.au)}</>}</span>
                <span><b>{a.detenteur || "En stock"}</b>{a.direction && <span className="muted"> · {a.direction}</span>}</span>
                <SuiteMotif a={attributions[attributions.indexOf(a) - 1]} />
              </li>
            ))}
          </ol>
        </>
      ) : <p className="muted" style={{ margin: 0 }}>Aucun autre détenteur enregistré.</p>}
      {actuelle && actuelle.origine !== "import" && (
        <p className="muted petit-texte" style={{ margin: 0 }}>
          Dernier changement : {actuelle.motif}{actuelle.saisiPar && `, saisi par ${actuelle.saisiPar}`}
          {actuelle.commentaire && <> — <i>{actuelle.commentaire}</i></>}
        </p>
      )}
    </section>
  );
}

// Motif de la période suivante = raison pour laquelle celle-ci s'est terminée
function SuiteMotif({ a }) {
  if (!a) return null;
  return <i className="muted petit-texte">Fin : {a.motif || ORIGINES[a.origine]}{a.saisiPar && ` (${a.saisiPar})`}</i>;
}

const initiales = nom => nom.split(/\s+/).filter(Boolean).map(m => m[0]).slice(0, 2).join("").toUpperCase();

const valeursDe = (equipements, k) =>
  [...new Set(equipements.map(x => x[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "fr"));

// Fenêtre « Réattribuer l'équipement »
export function FormReattribution({ equipement: e, equipements, depuis, motifInitial = "", onEnregistrer, onFermer }) {
  const [f, setF] = useState(() => ({
    detenteur: "", direction: e.direction || "", site: e.site || "", emplacement: e.emplacement || "",
    date: aujourdhui(), motif: motifInitial, commentaire: "", decharge: true,
    typeBeneficiaire: e.typeBeneficiaire && e.typeBeneficiaire !== "non_affecte" ? e.typeBeneficiaire : "personnel",
    structureId: null, recuPar: ""
  }));
  const [structures, rechargerStructures] = useStructures();
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const stock = f.motif === RETOUR_STOCK;
  const niveau = !stock && NIVEAU_DU_TYPE[f.typeBeneficiaire];
  const choisirType = t => setF(v => ({ ...v, typeBeneficiaire: t, structureId: null }));
  // Une structure choisie remplit la direction et le site si l'agent ne les a pas changés
  const choisirStructure = id => {
    const s = structures.find(x => x.id === id);
    setF(v => ({ ...v, structureId: id, ...(s && { direction: s.nom, site: s.niveau === "site" ? s.nom : v.site }) }));
  };

  useEffect(() => {
    const echap = ev => ev.key === "Escape" && onFermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [onFermer]);

  const listes = useMemo(() => Object.fromEntries(
    ["utilisateur", "direction", "site", "emplacement"].map(k => [k, valeursDe(equipements, k)])), [equipements]);
  // Autres appareils déjà détenus par la personne saisie
  const dejaDetenus = f.detenteur.trim()
    ? equipements.filter(x => x.id !== e.id && x.utilisateur && x.utilisateur.toLowerCase() === f.detenteur.trim().toLowerCase())
    : [];

  const maj = k => ev => setF(v => ({ ...v, [k]: ev.target.type === "checkbox" ? ev.target.checked : ev.target.value }));

  async function soumettre(ev) {
    ev.preventDefault();
    const manque = [];
    if (!stock && !niveau && !f.detenteur.trim()) manque.push(f.typeBeneficiaire === "service" ? "le nom du service" : "le nouveau détenteur");
    if (niveau && !f.structureId) manque.push("la structure sanitaire");
    if (!f.date) manque.push("la date");
    if (!f.motif) manque.push("le motif");
    if (manque.length) { setErreur("À compléter : " + manque.join(", ") + "."); return; }
    if (depuis && f.date < depuis) { setErreur(`La date ne peut pas précéder le début de l’attribution actuelle (${fmtDate(depuis)}).`); return; }
    if (f.date > aujourdhui()) { setErreur("La date ne peut pas être dans le futur."); return; }
    setEnvoi(true); setErreur("");
    try {
      await onEnregistrer({ ...f, detenteur: stock || niveau ? null : f.detenteur.trim(), structureId: niveau ? f.structureId : null },
        !stock && f.decharge);
    } catch (ex) {
      setErreur("Enregistrement impossible : " + ex.message);
      setEnvoi(false);
    }
  }

  return (
    <div className="overlay" onClick={ev => ev.target === ev.currentTarget && onFermer()}>
      <form className="card petite-moyenne" role="dialog" aria-modal="true" aria-labelledby="raTitre" noValidate onSubmit={soumettre}>
        <div className="formhead">
          <div style={{ display: "grid", gap: 4 }}>
            <span className="label">Réattribuer l’équipement</span>
            <h2 id="raTitre">{e.descriptif}</h2>
            <span className="muted mono" style={{ fontSize: ".8rem" }}>{e.numeroFiche || "Sans n° de fiche"}</span>
          </div>
        </div>

        <div className="kv">
          <div><span className="label">Détenteur actuel</span><span>{e.utilisateur || "En stock"}</span></div>
          <div><span className="label">Depuis</span><span className="mono">{depuis ? fmtDate(depuis) : "—"}</span></div>
        </div>

        <fieldset>
          <legend><span className="n">1</span> Motif et date</legend>
          <div className="grid">
            <label className="field"><span className="label">Motif *</span>
              <select value={f.motif} onChange={maj("motif")} autoFocus>
                <option value="">— Choisir —</option>
                {MOTIFS_ATTRIBUTION.map(m => <option key={m}>{m}</option>)}
              </select></label>
            <label className="field"><span className="label">Date de la réattribution *</span>
              <input type="date" value={f.date} min={depuis || undefined} max={aujourdhui()} onChange={maj("date")} /></label>
          </div>
        </fieldset>

        <fieldset>
          <legend><span className="n">2</span> {stock ? "Lieu de stockage" : "Nouveau bénéficiaire"}</legend>
          {!stock && <ChoixType type={f.typeBeneficiaire} onType={choisirType} exclure={["non_affecte"]} />}
          {niveau && (
            <div className="grid">
              <ChoixStructure niveau={niveau} valeur={f.structureId} onChange={choisirStructure}
                structures={structures} onCree={rechargerStructures} />
              <label className="field"><span className="label">Personne qui reçoit (facultatif)</span>
                <input value={f.recuPar} onChange={maj("recuPar")} placeholder="ex. pharmacien du centre" /></label>
            </div>
          )}
          <div className="grid">
            {!stock && !niveau && (
              <label className="field"><span className="label">{f.typeBeneficiaire === "service" ? "Nom du service *" : "Nom du nouveau détenteur *"}</span>
                <input value={f.detenteur} onChange={maj("detenteur")} list="dl_ra_utilisateur"
                  placeholder={f.typeBeneficiaire === "service" ? "ex. DSI NPSP, MAGASIN G" : "ex. KOUAME Jean"} /></label>
            )}
            <label className="field"><span className="label">Direction / service</span>
              <input value={f.direction} onChange={maj("direction")} list="dl_ra_direction" /></label>
            <label className="field"><span className="label">Site</span>
              <input value={f.site} onChange={maj("site")} list="dl_ra_site" /></label>
            <label className="field"><span className="label">Emplacement</span>
              <input value={f.emplacement} onChange={maj("emplacement")} list="dl_ra_emplacement" placeholder={stock ? "ex. Magasin informatique" : "ex. Bureau 12"} /></label>
          </div>
          {dejaDetenus.length > 0 && (
            <p className="hint">
              {f.detenteur.trim()} détient déjà {dejaDetenus.length} autre(s) appareil(s) :{" "}
              {dejaDetenus.slice(0, 3).map(x => x.descriptif).join(", ")}{dejaDetenus.length > 3 && "…"}
            </p>
          )}
          <label className="field"><span className="label">Commentaire</span>
            <input value={f.commentaire} onChange={maj("commentaire")} placeholder="ex. remis avec chargeur et housse" /></label>
          {!stock && (
            <label className="case">
              <input type="checkbox" checked={f.decharge} onChange={maj("decharge")} />
              Préparer ensuite la décharge de remise au nouveau détenteur
            </label>
          )}
        </fieldset>

        {erreur && <p className="notice" style={{ margin: 0 }}>{erreur}</p>}

        <div className="actions">
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button type="submit" className="btn primary" disabled={envoi}>{envoi ? "Enregistrement…" : stock ? "Remettre en stock" : "Réattribuer"}</button>
        </div>

        {Object.entries(listes).map(([k, vals]) => (
          <datalist key={k} id={"dl_ra_" + k}>{vals.map(v => <option key={v} value={v} />)}</datalist>
        ))}
      </form>
    </div>
  );
}
