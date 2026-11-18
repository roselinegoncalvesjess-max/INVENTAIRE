import { useEffect, useMemo, useState } from "react";
import { apiEquipements } from "../api.js";
import { aujourdhui, ecrireDateSeance, fmtDate, lireDateSeance } from "../utils.js";
import Icone from "./Icone.jsx";

// Bandeau de la page Inventaire physique : date du passage sur le terrain, reprise dans chaque constat
export function BandeauDateSeance({ peutModifier, onCorriger }) {
  const [date, setDate] = useState(() => lireDateSeance() || aujourdhui());
  const changer = v => { setDate(v); ecrireDateSeance(v && v !== aujourdhui() ? v : ""); };
  const differente = date && date !== aujourdhui();
  return (
    <section className={"bandeau-date" + (differente ? " decalee" : "")}>
      <Icone nom="inventaire" taille={18} />
      <label className="field"><span className="label">Date de l’inventaire physique</span>
        <input type="date" value={date} max={aujourdhui()} onChange={ev => changer(ev.target.value)} /></label>
      <p className="muted petit-texte" style={{ margin: 0 }}>
        {differente
          ? <>Les constats saisis maintenant seront datés du <b>{fmtDate(date)}</b> (jour du passage), et non d’aujourd’hui.</>
          : "Si vous saisissez un inventaire fait un autre jour, choisissez ici la date du passage : elle sera reprise dans chaque constat."}
      </p>
      {differente && <button className="btn petit" onClick={() => changer(aujourdhui())}>Revenir à aujourd’hui</button>}
      {peutModifier && <button className="btn petit" onClick={onCorriger}>Corriger des dates déjà saisies…</button>}
    </section>
  );
}

// Déplace d'un coup tous les relevés d'une date vers une autre (les siens, ou tous pour un administrateur)
export function FenetreCorrigerDates({ moi, onFait, onFermer }) {
  const [releves, setReleves] = useState(null);
  const [de, setDe] = useState(aujourdhui());
  const [vers, setVers] = useState(lireDateSeance() || "");
  const [tous, setTous] = useState(false);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const estAdmin = moi.role === "admin";

  useEffect(() => { apiEquipements.tousReleves().then(setReleves).catch(() => setReleves([])); }, []);
  useEffect(() => {
    const echap = ev => ev.key === "Escape" && onFermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [onFermer]);

  const miens = r => r.utilisateurId === moi.id || (!r.utilisateurId && r.agent === moi.nom);
  const visibles = (releves || []).filter(r => (estAdmin && tous) || miens(r));
  // Dates existantes, avec le nombre de relevés, pour choisir facilement
  const parDate = useMemo(() => {
    const m = {};
    for (const r of visibles) m[r.date] = (m[r.date] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
  }, [visibles]);
  const concernes = visibles.filter(r => r.date === de);

  const valider = async () => {
    if (!vers) { setErreur("Choisissez la bonne date."); return; }
    if (vers > aujourdhui()) { setErreur("La date ne peut pas être dans le futur."); return; }
    if (vers === de) { setErreur("Les deux dates sont identiques."); return; }
    setEnvoi(true); setErreur("");
    try {
      const r = await apiEquipements.redaterLot(de, vers, estAdmin && tous);
      await onFait(`${r.modifies} relevé(s) redaté(s) au ${fmtDate(vers)}`);
    } catch (ex) { setErreur("Correction impossible : " + ex.message); setEnvoi(false); }
  };

  return (
    <div className="overlay" onClick={ev => ev.target === ev.currentTarget && onFermer()}>
      <div className="card petite-moyenne" role="dialog" aria-modal="true" aria-labelledby="cdTitre">
        <div className="formhead">
          <div style={{ display: "grid", gap: 4 }}>
            <span className="label">Inventaire physique</span>
            <h2 id="cdTitre">Corriger la date de relevés déjà saisis</h2>
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Exemple : inventaire fait sur le terrain le 15/11, saisi dans l’application le 17/11. Tous les relevés datés du
          premier jour passent à la bonne date ; la date du dernier inventaire de chaque équipement suit.
        </p>
        {estAdmin && (
          <label className="case"><input type="checkbox" checked={tous} onChange={ev => setTous(ev.target.checked)} />
            Relevés de tous les agents (sinon : seulement les miens)</label>
        )}
        {releves === null ? <p className="muted">Chargement des relevés…</p> : (
          <>
            <div className="grid">
              <label className="field"><span className="label">Relevés datés du</span>
                <select value={de} onChange={ev => setDe(ev.target.value)}>
                  {!parDate.some(([d]) => d === de) && <option value={de}>{fmtDate(de)} — aucun relevé</option>}
                  {parDate.map(([d, n]) => <option key={d} value={d}>{fmtDate(d)} — {n} relevé(s)</option>)}
                </select></label>
              <label className="field"><span className="label">Bonne date (jour du passage)</span>
                <input type="date" value={vers} max={aujourdhui()} onChange={ev => setVers(ev.target.value)} /></label>
            </div>
            <p className="notice info" style={{ margin: 0 }}>
              {concernes.length
                ? <><b>{concernes.length} relevé(s)</b> du {fmtDate(de)}{tous ? "" : " saisis par vous"} seront datés du <b>{vers ? fmtDate(vers) : "…"}</b>.</>
                : "Aucun relevé à cette date."}
            </p>
          </>
        )}
        {erreur && <p className="notice" style={{ margin: 0 }}>{erreur}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button type="button" className="btn primary" disabled={envoi || !concernes.length} onClick={valider}>
            {envoi ? "Correction…" : `Corriger ${concernes.length || ""} relevé(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Date d'un relevé dans l'historique d'une fiche, modifiable par son auteur ou un administrateur
export function DateReleve({ releve: h, moi, onModifie }) {
  const [edition, setEdition] = useState(false);
  const [date, setDate] = useState(h.date);
  const [erreur, setErreur] = useState("");
  const peut = moi && moi.role !== "lecteur" && (moi.role === "admin" || h.utilisateurId === moi.id || (!h.utilisateurId && h.agent === moi.nom));
  const saisiLe = h.creeLe && String(h.creeLe).slice(0, 10);

  if (!edition) return (
    <span className="mono muted">
      {fmtDate(h.date)}
      {saisiLe && saisiLe !== h.date && <span className="petit-texte"> (saisi le {fmtDate(saisiLe)})</span>}
      {peut && <button className="btn-ico mini" onClick={() => { setDate(h.date); setEdition(true); }} title="Corriger la date" aria-label="Corriger la date du relevé"><Icone nom="historique" taille={13} /></button>}
    </span>
  );
  const enregistrer = async () => {
    try { await apiEquipements.redater(h.id, date); setEdition(false); await onModifie(`Relevé redaté au ${fmtDate(date)}`); }
    catch (ex) { setErreur(ex.message); }
  };
  return (
    <span className="date-edition">
      <input type="date" value={date} max={aujourdhui()} onChange={ev => setDate(ev.target.value)} aria-label="Nouvelle date du relevé" />
      <button className="btn petit primary" disabled={!date || date === h.date} onClick={enregistrer}>OK</button>
      <button className="btn petit" onClick={() => setEdition(false)}>Annuler</button>
      {erreur && <span className="hint">{erreur}</span>}
    </span>
  );
}
