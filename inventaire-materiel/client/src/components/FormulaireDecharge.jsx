import { useMemo, useState } from "react";
import { aplatir, imeiOk, norm } from "../utils.js";

let compteur = 0;
const articleVide = () => ({ cle: ++compteur, designation: "", quantite: 1, identifiant: "", imei: "", numeroSerie: "" });

export default function FormulaireDecharge({ decharge, decharges, structures, onEnregistrer, onAnnuler }) {
  const [form, setForm] = useState(() => ({
    dateRemise: decharge?.dateRemise || new Date().toISOString().slice(0, 10),
    structure: decharge?.structure || "",
    beneficiaireNom: decharge?.beneficiaireNom || "",
    beneficiaireTelephone: decharge?.beneficiaireTelephone || "",
    beneficiaireFonction: decharge?.beneficiaireFonction || ""
  }));
  const [articles, setArticles] = useState(() =>
    decharge?.articles?.length
      ? decharge.articles.map(a => ({ ...articleVide(), ...a, identifiant: a.identifiant || "", imei: a.imei || "", numeroSerie: a.numeroSerie || "" }))
      : [articleVide()]
  );
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  // Matériel des autres décharges, pour signaler les IMEI / n° de série déjà attribués
  const autres = useMemo(() => aplatir(decharges.filter(d => d.id !== decharge?.id)), [decharges, decharge]);
  const fonctions = useMemo(() => [...new Set(decharges.map(d => d.beneficiaireFonction).filter(Boolean))], [decharges]);
  const designations = useMemo(() => [...new Set(aplatir(decharges).map(a => a.designation))], [decharges]);

  const champ = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const majArticle = (cle, k, v) => setArticles(list => list.map(a => (a.cle === cle ? { ...a, [k]: v } : a)));
  const retirer = cle => setArticles(list => (list.length > 1 ? list.filter(a => a.cle !== cle) : list));

  function alertes(a) {
    const m = [];
    if (!imeiOk(a.imei))
      m.push(a.imei.length !== 15 ? `IMEI incomplet : ${a.imei.length}/15 chiffres.` : "IMEI invalide : la clé de contrôle ne correspond pas.");
    if (a.imei.length === 15) {
      const o = autres.find(x => x.imei === a.imei);
      if (o) m.push(`IMEI déjà attribué à ${o.decharge.beneficiaireNom} (${o.decharge.numero}).`);
    }
    if (a.numeroSerie) {
      const o = autres.find(x => x.numeroSerie && norm(x.numeroSerie) === norm(a.numeroSerie));
      if (o) m.push(`N° de série déjà attribué à ${o.decharge.beneficiaireNom} (${o.decharge.numero}).`);
    }
    return m;
  }

  async function soumettre(e) {
    e.preventDefault();
    const manque = [];
    if (!form.dateRemise) manque.push("la date de remise");
    if (!form.structure.trim()) manque.push("la structure bénéficiaire");
    if (!form.beneficiaireNom.trim()) manque.push("le nom du bénéficiaire");
    const lignes = articles.filter(a => a.designation || a.identifiant || a.imei || a.numeroSerie);
    if (!lignes.length || lignes.some(a => !a.designation.trim())) manque.push("la désignation de chaque équipement");
    if (manque.length) { setErreur("À compléter : " + manque.join(", ") + "."); return; }

    setEnvoi(true); setErreur("");
    try {
      await onEnregistrer({ ...form, articles: lignes.map(({ cle, id, ...a }) => a) });
    } catch (ex) {
      setErreur("Enregistrement impossible : " + ex.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="sheet" onSubmit={soumettre} noValidate>
      <div className="formhead">
        <h2>{decharge ? "Modifier la décharge" : "Nouvelle décharge de remise"}</h2>
        <span className="mono muted">{decharge ? decharge.numero : "N° attribué à l’enregistrement"}</span>
      </div>

      <fieldset>
        <legend><span className="n">1</span> Remise</legend>
        <div className="grid">
          <label className="field"><span className="label">Date de remise *</span>
            <input id="f_date" type="date" value={form.dateRemise} onChange={champ("dateRemise")} /></label>
          <label className="field"><span className="label">Structure bénéficiaire *</span>
            <input id="f_struct" list="dlStruct" value={form.structure} onChange={champ("structure")} placeholder="ex. Direction des Ressources Humaines" autoFocus /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend><span className="n">2</span> Bénéficiaire</legend>
        <div className="grid">
          <label className="field"><span className="label">Nom et prénoms *</span>
            <input id="f_nom" value={form.beneficiaireNom} onChange={champ("beneficiaireNom")} /></label>
          <label className="field"><span className="label">Téléphone</span>
            <input id="f_tel" type="tel" className="mono" value={form.beneficiaireTelephone} onChange={champ("beneficiaireTelephone")} placeholder="+225 07 00 00 00 00" /></label>
          <label className="field"><span className="label">Fonction</span>
            <input id="f_fct" list="dlFct" value={form.beneficiaireFonction} onChange={champ("beneficiaireFonction")} placeholder="ex. Chef de service" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend><span className="n">3</span> Matériel remis</legend>
        <div className="items">
          {articles.map(a => {
            const msgs = alertes(a);
            return (
              <div className="item" key={a.cle}>
                <label className="field f-des"><span className="label">Désignation *</span>
                  <input list="dlDes" value={a.designation} onChange={e => majArticle(a.cle, "designation", e.target.value)} placeholder="ex. Ordinateur portable HP ProBook 450" /></label>
                <label className="field"><span className="label">Qté *</span>
                  <input type="number" min="1" value={a.quantite} onChange={e => majArticle(a.cle, "quantite", e.target.value)} /></label>
                <label className="field"><span className="label">Identifiant</span>
                  <input className="mono" value={a.identifiant} onChange={e => majArticle(a.cle, "identifiant", e.target.value)} placeholder="ex. INV-PC-0142" /></label>
                <label className="field"><span className="label">IMEI</span>
                  <input className={"mono" + (imeiOk(a.imei) ? "" : " bad")} inputMode="numeric" maxLength={15} value={a.imei}
                    onChange={e => majArticle(a.cle, "imei", e.target.value.replace(/\D/g, ""))} placeholder="15 chiffres" /></label>
                <label className="field"><span className="label">N° de série</span>
                  <input className="mono" value={a.numeroSerie} onChange={e => majArticle(a.cle, "numeroSerie", e.target.value)} /></label>
                <button type="button" className="btn ghost rm" title="Retirer cet équipement" aria-label="Retirer cet équipement"
                  onClick={() => retirer(a.cle)} disabled={articles.length === 1}>✕</button>
                {msgs.length > 0 && <div className="hint">{msgs.join(" ")}</div>}
              </div>
            );
          })}
        </div>
        <div><button type="button" className="btn" onClick={() => setArticles(l => [...l, articleVide()])}>+ Ajouter un équipement</button></div>
      </fieldset>

      {erreur && <p className="notice">{erreur}</p>}

      <div className="actions">
        <button type="button" className="btn" onClick={onAnnuler}>Annuler</button>
        <button type="submit" className="btn primary" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer la décharge"}</button>
      </div>

      <datalist id="dlStruct">{structures.map(s => <option key={s} value={s} />)}</datalist>
      <datalist id="dlFct">{fonctions.map(s => <option key={s} value={s} />)}</datalist>
      <datalist id="dlDes">{designations.map(s => <option key={s} value={s} />)}</datalist>
    </form>
  );
}
