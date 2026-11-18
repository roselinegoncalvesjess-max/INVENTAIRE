import { useEffect, useMemo, useState } from "react";
import { apiEquipements } from "../api.js";
import { lireDateSeance, aujourdhui, CHAMPS_REQUIS, CONSTATS, ETATS, fmtDate, fmtMontant, manquants, norm, STATUTS } from "../utils.js";

// Champs du registre modifiables dans la fiche
const CHAMPS = ["numeroFiche", "identifiant", "type", "categorie", "descriptif", "referenceSerie", "accessoires",
  "valeurAcquisition", "dateDebut", "utilisateur", "site", "direction", "emplacement", "statut", "observation"];

const LIBELLES = {
  ...CHAMPS_REQUIS, identifiant: "Identifiant (ID)", type: "Type", categorie: "Catégorie", descriptif: "Descriptif",
  accessoires: "Consommables / accessoires", observation: "Observation"
};


const valeursDe = (equipements, k) =>
  [...new Set(equipements.map(e => e[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "fr"));

// Fiche de constat d'inventaire physique d'un équipement (ou d'un équipement non répertorié si equipement est null)
export default function FicheInventaire({ equipement: e, equipements, aSuivant, agent, onEnregistrer, onFermer }) {
  const nouveau = !e;
  const [champs, setChamps] = useState(() =>
    Object.fromEntries(CHAMPS.map(k => [k, e?.[k] === null || e?.[k] === undefined ? "" : String(e[k])])));
  const [releve, setReleve] = useState(() => ({
    date: lireDateSeance() || aujourdhui(), agent: agent || "", constat: "Présent", etatPhysique: e?.etatPhysique || "", commentaire: ""
  }));
  const [historique, setHistorique] = useState([]);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!e?.nbReleves) return;
    apiEquipements.releves(e.id).then(setHistorique).catch(() => setHistorique([]));
  }, [e?.id, e?.nbReleves]);

  useEffect(() => {
    const echap = ev => ev.key === "Escape" && onFermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [onFermer]);

  const listes = useMemo(() => Object.fromEntries(
    ["type", "categorie", "accessoires", "utilisateur", "site", "direction", "emplacement"].map(k => [k, valeursDe(equipements, k)])
  ), [equipements]);

  const restants = manquants(champs);
  const estManquant = k => restants.includes(CHAMPS_REQUIS[k]);
  const initialementManquants = useMemo(() => (e ? manquants(e).length : 0), [e]);

  // N° de fiche / série déjà portés par un autre équipement
  const autre = k => champs[k] && equipements.find(x => x.id !== e?.id && x[k] && norm(x[k]) === norm(champs[k]));
  const fichePrise = autre("numeroFiche");
  const seriePrise = autre("referenceSerie");

  const majChamp = k => ev => setChamps(c => ({ ...c, [k]: ev.target.value }));
  const majReleve = k => ev => setReleve(r => ({ ...r, [k]: ev.target.value }));

  async function soumettre(suivant) {
    const manque = [];
    if (!releve.date) manque.push("la date de l’inventaire");
    if (releve.date > aujourdhui()) { setErreur("La date de l’inventaire ne peut pas être dans le futur."); return; }
    if (!champs.descriptif.trim()) manque.push("le descriptif");
    if (manque.length) { setErreur("À compléter : " + manque.join(", ") + "."); return; }
    if (champs.valeurAcquisition && !Number.isFinite(Number(champs.valeurAcquisition.replace(/\s/g, "").replace(",", ".")))) {
      setErreur("La valeur d’acquisition doit être un nombre."); return;
    }
    setEnvoi(true); setErreur("");
    try {
      await onEnregistrer({ releve, champs }, suivant);
    } catch (ex) {
      setErreur("Enregistrement impossible : " + ex.message);
      setEnvoi(false);
    }
  }

  const champTexte = (k, props = {}) => (
    <label className={"field" + (estManquant(k) ? " manquant" : "")} key={k}>
      <span className="label">{LIBELLES[k]}{estManquant(k) && <em> · à compléter</em>}</span>
      <input value={champs[k]} onChange={majChamp(k)} list={listes[k] ? "dl_" + k : undefined} {...props} />
    </label>
  );

  return (
    <div className="overlay" onClick={ev => ev.target === ev.currentTarget && onFermer()}>
      <form className="card" role="dialog" aria-modal="true" aria-labelledby="fiTitre" noValidate
        onSubmit={ev => { ev.preventDefault(); soumettre(false); }}>
        <div className="formhead">
          <div style={{ display: "grid", gap: 4 }}>
            <span className="label">{nouveau ? "Équipement trouvé, absent du registre" : "Constat d’inventaire physique"}</span>
            <h2 id="fiTitre">{nouveau ? "Nouvel équipement" : e.descriptif}</h2>
            {!nouveau && (
              <span className="muted mono" style={{ fontSize: ".8rem" }}>
                {[e.numOrdre && `N° Ord ${e.numOrdre}`, e.numeroCompte && `Compte ${e.numeroCompte}`, e.ligneExcel && `Ligne Excel ${e.ligneExcel}`].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
          {!nouveau && (
            <span className={"chip " + (restants.length ? "ex" : "ok")}>
              {restants.length ? `${restants.length} information(s) manquante(s)` : initialementManquants ? "Fiche complétée" : "Fiche complète"}
            </span>
          )}
        </div>

        {e?.anomalieImport && <p className="notice" style={{ margin: 0 }}><b>Anomalie à l’import :</b> {e.anomalieImport}</p>}

        {!nouveau && (
          <div className="kv">
            <div><span className="label">Valeur nette au 31/12/2024</span><span className="mono">{fmtMontant(e.valeurNette)}</span></div>
            <div><span className="label">Fin d’amortissement</span><span className="mono">{fmtDate(e.dateFin)}</span></div>
            <div><span className="label">Durée · taux</span><span className="mono">{e.duree ? `${e.duree} ans` : "—"} · {e.taux != null ? `${e.taux} %` : "—"}</span></div>
            <div><span className="label">Dernier inventaire</span><span>{e.inventorieLe ? `${fmtDate(e.inventorieLe)} — ${e.constat}, par ${e.inventoriePar}` : "Jamais inventorié"}</span></div>
          </div>
        )}

        <fieldset>
          <legend><span className="n">1</span> Constat</legend>
          <div className="grid">
            <label className="field"><span className="label">Date de l’inventaire *</span>
              <input type="date" value={releve.date} max={aujourdhui()} onChange={majReleve("date")} />
              {releve.date && releve.date !== aujourdhui() && <span className="muted petit-texte">Constat daté du {fmtDate(releve.date)}, saisi aujourd’hui</span>}</label>
            <label className="field"><span className="label">Agent qui inventorie *</span>
              <input value={releve.agent} readOnly title="Le constat est enregistré au nom du compte connecté" /></label>
            <label className="field"><span className="label">État physique</span>
              <select value={releve.etatPhysique} onChange={majReleve("etatPhysique")}>
                <option value="">— Non précisé —</option>
                {ETATS.map(s => <option key={s}>{s}</option>)}
              </select></label>
          </div>
          <div className="segment" role="radiogroup" aria-label="Constat">
            {CONSTATS.map(c => (
              <label key={c} className={releve.constat === c ? "on" : ""}>
                <input type="radio" name="constat" value={c} checked={releve.constat === c} onChange={majReleve("constat")} />{c}
              </label>
            ))}
          </div>
          <label className="field"><span className="label">Commentaire du relevé</span>
            <input value={releve.commentaire} onChange={majReleve("commentaire")} placeholder="ex. retrouvé au bureau 12, étiquette illisible" /></label>
        </fieldset>

        <fieldset>
          <legend><span className="n">2</span> Identification</legend>
          <div className="grid">
            {champTexte("descriptif")}
            {champTexte("type")}
            {champTexte("categorie")}
            {champTexte("numeroFiche", { className: "mono" })}
            {champTexte("identifiant", { className: "mono" })}
            {champTexte("referenceSerie", { className: "mono" })}
            {champTexte("accessoires")}
          </div>
          {(fichePrise || seriePrise) && (
            <p className="hint">
              {fichePrise && `N° de fiche déjà utilisé par « ${fichePrise.descriptif} » (N° Ord ${fichePrise.numOrdre ?? "—"}). `}
              {seriePrise && `N° de série déjà porté par « ${seriePrise.descriptif} »${seriePrise.numeroFiche ? ` (${seriePrise.numeroFiche})` : ""}.`}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend><span className="n">3</span> Affectation</legend>
          <div className="grid">
            {champTexte("utilisateur")}
            {champTexte("site")}
            {champTexte("direction")}
            {champTexte("emplacement")}
            <label className={"field" + (estManquant("statut") ? " manquant" : "")}>
              <span className="label">Statut{estManquant("statut") && <em> · à compléter</em>}</span>
              <select value={champs.statut} onChange={majChamp("statut")}>
                <option value="">— Non renseigné —</option>
                {STATUTS.map(s => <option key={s}>{s}</option>)}
                {champs.statut && !STATUTS.includes(champs.statut) && <option>{champs.statut}</option>}
              </select></label>
            {champTexte("observation", { placeholder: "ex. écran fissuré, non retourné" })}
          </div>
        </fieldset>

        <fieldset>
          <legend><span className="n">4</span> Acquisition</legend>
          <div className="grid">
            {champTexte("valeurAcquisition", { className: "mono", inputMode: "decimal", placeholder: "en FCFA" })}
            <label className={"field" + (estManquant("dateDebut") ? " manquant" : "")}>
              <span className="label">{LIBELLES.dateDebut}{estManquant("dateDebut") && <em> · à compléter</em>}</span>
              <input type="date" value={champs.dateDebut} onChange={majChamp("dateDebut")} /></label>
          </div>
        </fieldset>

        {historique.length > 0 && (
          <fieldset>
            <legend><span className="n">↺</span> Historique des inventaires</legend>
            <ul className="histo">
              {historique.map(h => (
                <li key={h.id}>
                  <span className="mono">{fmtDate(h.date)}</span> · <b>{h.constat}</b>{h.etatPhysique && ` (${h.etatPhysique})`} · {h.agent}
                  {h.commentaire && <> — <i>{h.commentaire}</i></>}
                  {Object.keys(h.modifications || {}).length > 0 && (
                    <div className="muted" style={{ fontSize: ".8rem" }}>
                      Complété : {Object.entries(h.modifications).map(([k, m]) =>
                        `${LIBELLES[k] || k} ${m.avant === null ? "" : `« ${m.avant} » → `}« ${m.apres ?? "vide"} »`).join(" ; ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        {erreur && <p className="notice" style={{ margin: 0 }}>{erreur}</p>}

        <div className="actions">
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          {aSuivant && <button type="button" className="btn" disabled={envoi} onClick={() => soumettre(true)}>Enregistrer et suivant →</button>}
          <button type="submit" className="btn primary" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer le constat"}</button>
        </div>

        {Object.entries(listes).map(([k, vals]) => (
          <datalist key={k} id={"dl_" + k}>{vals.map(v => <option key={v} value={v} />)}</datalist>
        ))}
      </form>
    </div>
  );
}
