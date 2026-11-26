import { useEffect, useMemo, useState } from "react";
import { RETOUR_STOCK } from "../api.js";
import { aujourdhui, ETATS, fmtDate, TYPES_BENEFICIAIRE } from "../utils.js";
import Icone from "./Icone.jsx";
import { DateReleve } from "./DatesInventaire.jsx";

// Types de mouvement (mêmes clés que le serveur, voir server/src/mouvements.js)
// groupe : regroupement dans la page Historique · teinte : couleur du point dans la chronologie
export const TYPES_MOUVEMENT = {
  deplacement:       { libelle: "Déplacement", aide: "Changement de site, de service ou d’emplacement, même détenteur", icone: "lieu", groupe: "deplacement" },
  reparation:        { libelle: "Envoi en réparation", aide: "L’appareil part chez un prestataire ou au service technique", icone: "alerte", groupe: "reparation", sortie: true },
  retour_reparation: { libelle: "Retour de réparation", aide: "L’appareil revient et reprend du service", icone: "ok", groupe: "reparation", retour: "reparation" },
  pret:              { libelle: "Prêt temporaire", aide: "Prêté pour une durée limitée, avec une date de retour", icone: "utilisateur", groupe: "pret", sortie: true },
  retour_pret:       { libelle: "Retour de prêt", aide: "L’appareil prêté est rendu", icone: "retour", groupe: "pret", retour: "pret" },
  panne:             { libelle: "Panne", aide: "L’appareil ne fonctionne plus (passe hors service)", icone: "alerte", groupe: "incident" },
  perte_vol:         { libelle: "Perte ou vol", aide: "Déclaration de perte ou de vol", icone: "absent", groupe: "incident" },
  remise_service:    { libelle: "Remise en service", aide: "Retrouvé, réparé sur place ou remis en marche", icone: "ok", groupe: "statut" },
  reforme:           { libelle: "Réforme", aide: "Sortie définitive du parc (hors d’usage, cession…)", icone: "fermer", groupe: "statut" },
  correction:        { libelle: "Correction de la fiche", aide: "Corriger le descriptif, le n° de série, la valeur…", icone: "info", groupe: "modification" }
};

// Libellés des champs : noms de l'interface et colonnes SQL (journal automatique)
export const LIBELLES_CHAMPS = {
  numeroFiche: "N° de fiche", identifiant: "Identifiant", type: "Type", categorie: "Catégorie", descriptif: "Descriptif",
  referenceSerie: "N° de série", accessoires: "Accessoires", valeurAcquisition: "Valeur d’acquisition",
  dateDebut: "Date d’acquisition", utilisateur: "Détenteur", site: "Site", direction: "Direction", emplacement: "Emplacement",
  statut: "Statut", observation: "Observation", etatPhysique: "État physique",
  numero_fiche: "N° de fiche", reference_serie: "N° de série", valeur_acquisition: "Valeur d’acquisition",
  date_debut: "Date d’acquisition", etat_physique: "État physique", type_beneficiaire: "Type de bénéficiaire",
  structure_id: "Structure sanitaire", nouvel_utilisateur: "Nouvel utilisateur", date_nouvelle_attribution: "Date de nouvelle attribution",
  anomalie_import: "Anomalie d’import", num_ordre: "N° d’ordre", numero_compte: "N° de compte"
};
const SOURCES = { classement: "Classement du bénéficiaire", fusion: "Regroupement de noms en double" };

const valeurLisible = (champ, v) => {
  if (v === null || v === undefined || v === "") return "vide";
  if (champ === "type_beneficiaire") return TYPES_BENEFICIAIRE[v]?.libelle || v;
  if (champ === "structure_id") return "n° " + v;
  if (/date/i.test(champ) && /^\d{4}-\d{2}-\d{2}/.test(String(v))) return fmtDate(String(v));
  return String(v);
};
export const decrireModifications = mods =>
  Object.entries(mods || {}).map(([k, m]) => `${LIBELLES_CHAMPS[k] || k} : ${valeurLisible(k, m.avant)} → ${valeurLisible(k, m.apres)}`).join(" ; ");

// Date locale (AAAA-MM-JJ) d'un horodatage du serveur
export const dateLocale = ts => {
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const enRetard = s => Boolean(s?.retourPrevu && s.retourPrevu < aujourdhui());
export const libelleSortie = s => s && (s.type === "pret"
  ? `En prêt chez ${s.destinataire} depuis le ${fmtDate(s.depuis)}${s.retourPrevu ? `, retour prévu le ${fmtDate(s.retourPrevu)}` : ""}`
  : `En réparation (${s.destinataire}) depuis le ${fmtDate(s.depuis)}${s.retourPrevu ? `, retour prévu le ${fmtDate(s.retourPrevu)}` : ""}`);

const valeursDe = (equipements, k) =>
  [...new Set(equipements.map(x => x[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "fr"));

const CHAMPS_CORRECTION = [
  ["descriptif", "Descriptif *"], ["type", "Type"], ["categorie", "Catégorie"], ["numeroFiche", "N° de fiche", "mono"],
  ["identifiant", "Identifiant (ID)", "mono"], ["referenceSerie", "N° de série / IMEI", "mono"], ["accessoires", "Accessoires"],
  ["valeurAcquisition", "Valeur d’acquisition (FCFA)", "mono"], ["dateDebut", "Date d’acquisition", "date"], ["observation", "Observation"]
];

// Fenêtre « Enregistrer un mouvement »
export function FormMouvement({ equipement: e, equipements, onEnregistrer, onReattribuer, onFermer }) {
  const sortie = e.sortieEnCours;
  const reforme = e.statut === "Réformé";
  const [type, setType] = useState("");
  const [f, setF] = useState(() => ({
    date: aujourdhui(), motif: "", commentaire: "", piece: "", destinataire: "", retourPrevu: "",
    site: e.site || "", direction: e.direction || "", emplacement: e.emplacement || "", etatPhysique: "",
    ...Object.fromEntries(CHAMPS_CORRECTION.map(([k]) => [k, e[k] === null || e[k] === undefined ? "" : String(e[k])]))
  }));
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const t = TYPES_MOUVEMENT[type];

  useEffect(() => {
    const echap = ev => ev.key === "Escape" && onFermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [onFermer]);

  const listes = useMemo(() => Object.fromEntries(
    ["site", "direction", "emplacement", "type", "categorie", "accessoires"].map(k => [k, valeursDe(equipements, k)])), [equipements]);
  const maj = k => ev => setF(v => ({ ...v, [k]: ev.target.value }));

  // Un type est proposé seulement s'il a un sens dans l'état actuel de l'appareil
  const possible = k => {
    const x = TYPES_MOUVEMENT[k];
    if (reforme) return k === "correction";
    if (x.retour) return sortie?.type === x.retour;
    if (x.sortie || k === "reforme") return !sortie;
    return true;
  };

  async function soumettre(ev) {
    ev.preventDefault();
    if (!f.date) { setErreur("Indiquez la date du mouvement."); return; }
    if (f.date > aujourdhui()) { setErreur("La date ne peut pas être dans le futur."); return; }
    if (t.retour && sortie && f.date < sortie.depuis) { setErreur(`Le retour ne peut pas précéder la sortie (${fmtDate(sortie.depuis)}).`); return; }
    if (t.sortie && !f.destinataire.trim()) { setErreur(type === "pret" ? "Indiquez à qui l’appareil est prêté." : "Indiquez qui répare l’appareil."); return; }
    if (type === "pret" && !f.retourPrevu) { setErreur("Indiquez la date de retour prévue."); return; }
    if (f.retourPrevu && f.retourPrevu < f.date) { setErreur("Le retour prévu ne peut pas précéder la date du mouvement."); return; }
    if (type === "correction" && !f.descriptif.trim()) { setErreur("Le descriptif est obligatoire."); return; }
    const champs = {};
    if (type === "deplacement") ["site", "direction", "emplacement"].forEach(k => { champs[k] = f[k]; });
    if (type === "correction") CHAMPS_CORRECTION.forEach(([k]) => { champs[k] = f[k]; });
    if (["reparation", "retour_reparation", "retour_pret", "panne", "remise_service"].includes(type) && f.etatPhysique) champs.etatPhysique = f.etatPhysique;
    setEnvoi(true); setErreur("");
    try {
      await onEnregistrer({ type, date: f.date, motif: f.motif, commentaire: f.commentaire, piece: f.piece,
        destinataire: f.destinataire, retourPrevu: f.retourPrevu || null, champs });
    } catch (ex) {
      setErreur("Enregistrement impossible : " + ex.message);
      setEnvoi(false);
    }
  }

  return (
    <div className="overlay" onClick={ev => ev.target === ev.currentTarget && onFermer()}>
      <form className="card petite-moyenne" role="dialog" aria-modal="true" aria-labelledby="mvTitre" noValidate onSubmit={soumettre}>
        <div className="formhead">
          <div style={{ display: "grid", gap: 4 }}>
            <span className="label">Enregistrer un mouvement</span>
            <h2 id="mvTitre">{e.descriptif}</h2>
            <span className="muted mono" style={{ fontSize: ".8rem" }}>{e.numeroFiche || "Sans n° de fiche"}</span>
          </div>
        </div>

        <div className="kv">
          <div><span className="label">Détenteur</span><span>{e.utilisateur || "En stock"}</span></div>
          <div><span className="label">Lieu</span><span>{[e.site, e.emplacement].filter(Boolean).join(" · ") || "—"}</span></div>
          <div><span className="label">Statut</span><span>{e.statut || "—"}</span></div>
        </div>
        {sortie && <p className={"notice" + (enRetard(sortie) ? "" : " info")} style={{ margin: 0 }}>{libelleSortie(sortie)}{enRetard(sortie) && " — en retard"}</p>}

        <fieldset>
          <legend><span className="n">1</span> Que s’est-il passé ?</legend>
          <div className="choix-mouvements">
            {!reforme && (
              <>
                <button type="button" className="choix-mvt" onClick={() => onReattribuer("")}>
                  <Icone nom="utilisateur" taille={16} /><b>Affectation / réattribution</b><span>Nouveau détenteur (personne, service, structure)</span>
                </button>
                {e.utilisateur && (
                  <button type="button" className="choix-mvt" onClick={() => onReattribuer(RETOUR_STOCK)}>
                    <Icone nom="remis" taille={16} /><b>Retour en stock</b><span>Le détenteur rend l’appareil</span>
                  </button>
                )}
              </>
            )}
            {Object.entries(TYPES_MOUVEMENT).filter(([k]) => possible(k)).map(([k, x]) => (
              <button type="button" key={k} className={"choix-mvt" + (type === k ? " on" : "")} aria-pressed={type === k}
                onClick={() => { setType(k); setErreur(""); }}>
                <Icone nom={x.icone} taille={16} /><b>{x.libelle}</b><span>{x.aide}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {t && (
          <fieldset>
            <legend><span className="n">2</span> {t.libelle}</legend>
            <div className="grid">
              <label className="field"><span className="label">Date *</span>
                <input type="date" value={f.date} max={aujourdhui()} min={t.retour ? sortie?.depuis : undefined} onChange={maj("date")} /></label>
              {t.sortie && (
                <label className="field"><span className="label">{type === "pret" ? "Prêté à *" : "Réparé par *"}</span>
                  <input value={f.destinataire} onChange={maj("destinataire")} list="dl_mv_utilisateur"
                    placeholder={type === "pret" ? "ex. KOUAME Jean" : "ex. service technique, prestataire"} /></label>
              )}
              {t.sortie && (
                <label className="field"><span className="label">Retour prévu le{type === "pret" && " *"}</span>
                  <input type="date" value={f.retourPrevu} min={f.date} onChange={maj("retourPrevu")} /></label>
              )}
              {["reparation", "retour_reparation", "retour_pret", "panne", "remise_service"].includes(type) && (
                <label className="field"><span className="label">État physique</span>
                  <select value={f.etatPhysique} onChange={maj("etatPhysique")}>
                    <option value="">{type === "panne" ? "Défaillant (par défaut)" : "— Inchangé —"}</option>
                    {ETATS.map(s => <option key={s}>{s}</option>)}
                  </select></label>
              )}
            </div>

            {type === "deplacement" && (
              <div className="grid">
                {[["site", "Site"], ["direction", "Direction / service"], ["emplacement", "Emplacement"]].map(([k, l]) => (
                  <label className="field" key={k}><span className="label">{l}</span>
                    <input value={f[k]} onChange={maj(k)} list={"dl_mv_" + k} /></label>
                ))}
              </div>
            )}
            {type === "correction" && (
              <div className="grid">
                {CHAMPS_CORRECTION.map(([k, l, genre]) => (
                  <label className="field" key={k}><span className="label">{l}</span>
                    <input value={f[k]} onChange={maj(k)} type={genre === "date" ? "date" : "text"}
                      className={genre === "mono" ? "mono" : undefined} list={listes[k] ? "dl_mv_" + k : undefined} /></label>
                ))}
              </div>
            )}
            {t.retour && sortie && <p className="hint">Clôt : {libelleSortie(sortie)}.</p>}
            {["panne", "perte_vol", "reforme", "reparation", "retour_reparation", "remise_service"].includes(type) && (
              <p className="hint">Le statut de la fiche passera à « {{ reparation: "En réparation", retour_reparation: "En service", panne: "Hors service",
                perte_vol: "Volé ou perdu", remise_service: "En service", reforme: "Réformé" }[type]} ».</p>
            )}

            <div className="grid">
              <label className="field"><span className="label">Motif</span>
                <input value={f.motif} onChange={maj("motif")} placeholder="ex. écran cassé, mission terrain" /></label>
              <label className="field"><span className="label">Pièce justificative</span>
                <input value={f.piece} onChange={maj("piece")} placeholder="ex. DCH-2026-0012, PV n° 45" /></label>
            </div>
            <label className="field"><span className="label">Commentaire</span>
              <input value={f.commentaire} onChange={maj("commentaire")} /></label>
          </fieldset>
        )}

        {erreur && <p className="notice" style={{ margin: 0 }}>{erreur}</p>}

        <div className="actions">
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          {t && <button type="submit" className="btn primary" disabled={envoi}>{envoi ? "Enregistrement…" : "Enregistrer le mouvement"}</button>}
        </div>

        <datalist id="dl_mv_utilisateur">{valeursDe(equipements, "utilisateur").map(v => <option key={v} value={v} />)}</datalist>
        {Object.entries(listes).map(([k, vals]) => (
          <datalist key={k} id={"dl_mv_" + k}>{vals.map(v => <option key={v} value={v} />)}</datalist>
        ))}
      </form>
    </div>
  );
}

const ORIGINES = { import: "Attribution reprise du fichier Excel", inventaire: "Détenteur constaté à l’inventaire" };

// Tous les événements d'un équipement, du plus récent au plus ancien
export function construireChronologie({ releves, attributions, mouvements, journal, decharges, equipementId }) {
  const ev = [];
  for (const r of releves) ev.push({
    cle: "r" + r.id, date: r.date, ts: r.creeLe, teinte: r.constat === "Présent" ? "var(--st-bon)" : "var(--st-critique)",
    titre: `Inventaire : ${r.constat}`, detail: r.etatPhysique, par: r.agent, note: r.commentaire,
    modifs: decrireModifications(r.modifications), releve: r
  });
  // Attributions : de la plus ancienne à la plus récente pour connaître le détenteur précédent
  const chrono = [...attributions].sort((a, b) => a.id - b.id);
  chrono.forEach((a, i) => {
    const prec = chrono[i - 1];
    ev.push({
      cle: "a" + a.id, date: a.du || "", ts: a.creeLe, teinte: "var(--t-violet)",
      titre: prec ? `Réattribution : ${prec.detenteur || "En stock"} → ${a.detenteur || "En stock"}`
        : a.origine === "import" ? `${ORIGINES.import} : ${a.detenteur || "En stock"}` : `Attribution à ${a.detenteur || "stock"}`,
      detail: [a.motif !== "Fichier Excel" && a.motif, a.recuPar && `reçu par ${a.recuPar}`].filter(Boolean).join(" · "),
      par: a.saisiPar || (a.origine === "import" ? "Fichier Excel" : ""), note: a.commentaire
    });
  });
  for (const m of mouvements) {
    const t = TYPES_MOUVEMENT[m.type] || { libelle: m.type };
    ev.push({
      cle: "m" + m.id, date: m.date, ts: m.creeLe,
      teinte: { incident: "var(--st-critique)", reparation: "var(--st-attention)", pret: "var(--t-violet)", statut: "var(--st-neutre)" }[t.groupe] || "var(--accent)",
      titre: t.libelle + (m.destinataire ? ` — ${m.destinataire}` : ""),
      detail: [m.motif, m.retourPrevu && `retour prévu le ${fmtDate(m.retourPrevu)}`, m.closLe && `clos le ${fmtDate(m.closLe)}`,
        t.sortie && !m.closLe && (m.retourPrevu && m.retourPrevu < aujourdhui() ? "EN RETARD" : "en cours"), m.piece && `pièce : ${m.piece}`].filter(Boolean).join(" · "),
      par: m.saisiPar, note: m.commentaire, modifs: decrireModifications(m.modifications)
    });
  }
  for (const d of decharges) {
    if (!(d.articles || []).some(a => a.equipementId === equipementId)) continue;
    ev.push({
      cle: "d" + d.id, date: d.dateRemise, ts: d.creeLe, teinte: "var(--t-violet)", dechargeId: d.id,
      titre: `Décharge ${d.numero} : remis à ${d.beneficiaireNom}`, detail: d.structure, par: d.creePar
    });
  }
  for (const j of journal.filter(x => x.horsSuivi)) ev.push({
    cle: "j" + j.id, date: dateLocale(j.creeLe), ts: j.creeLe, teinte: "var(--st-vide)",
    titre: SOURCES[j.source] || "Modification de la fiche", par: j.auteur || "Application", modifs: decrireModifications(j.modifications)
  });
  return ev.sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.ts || "").localeCompare(String(a.ts || "")));
}

// Panneau « Chronologie » de la fiche équipement
export function Chronologie({ evenements, moi, onConstat, onOuvrirDecharge }) {
  const [tout, setTout] = useState(false);
  const visibles = tout ? evenements : evenements.slice(0, 12);
  if (!evenements.length) return <p className="muted" style={{ margin: 0 }}>Aucun mouvement enregistré.</p>;
  return (
    <>
      <ol className="frise">
        {visibles.map(h => (
          <li key={h.cle} style={{ "--point": h.teinte }}>
            {h.releve ? <DateReleve releve={h.releve} moi={moi} onModifie={onConstat} />
              : <span className="mono muted">{h.date ? fmtDate(h.date) : "Date inconnue"}</span>}
            <span>
              {h.dechargeId ? <button className="lien-btn lien" onClick={() => onOuvrirDecharge(h.dechargeId)}><b>{h.titre}</b></button> : <b>{h.titre}</b>}
              {h.par && <span className="muted"> — {h.par}</span>}
            </span>
            {h.detail && <span className="petit-texte">{h.detail}</span>}
            {h.note && <i className="muted">{h.note}</i>}
            {h.modifs && <span className="muted petit-texte">{h.modifs}</span>}
          </li>
        ))}
      </ol>
      {evenements.length > 12 && (
        <button className="btn petit" onClick={() => setTout(v => !v)}>{tout ? "Réduire" : `Voir les ${evenements.length} événements`}</button>
      )}
    </>
  );
}
