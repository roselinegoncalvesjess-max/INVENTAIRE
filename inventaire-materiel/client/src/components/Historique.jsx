import { useEffect, useMemo, useState } from "react";
import { apiEquipements } from "../api.js";
import { aujourdhui, fmtDate, norm } from "../utils.js";
import Icone from "./Icone.jsx";
import { PageTete, Pagination } from "./Commun.jsx";
import { dateLocale, decrireModifications, enRetard, libelleSortie, TYPES_MOUVEMENT } from "./Mouvements.jsx";

const PAR_PAGE = 30;
const TYPES = {
  constat: { libelle: "Constat", classe: "ok", icone: "ok" },
  absence: { libelle: "Absence", classe: "dup", icone: "absent" },
  completion: { libelle: "Complétion", classe: "info", icone: "inventaire" },
  remise: { libelle: "Remise", classe: "violet", icone: "remis" },
  reattribution: { libelle: "Réattribution", classe: "ex", icone: "utilisateur" },
  deplacement: { libelle: "Déplacement", classe: "info", icone: "lieu" },
  reparation: { libelle: "Réparation", classe: "ex", icone: "alerte" },
  pret: { libelle: "Prêt", classe: "violet", icone: "utilisateur" },
  incident: { libelle: "Panne, perte, vol", classe: "dup", icone: "absent" },
  statut: { libelle: "Remise en service / réforme", classe: "", icone: "ok" },
  modification: { libelle: "Modification de fiche", classe: "", icone: "info" }
};
const SOURCES = { classement: "Classement du bénéficiaire", fusion: "Regroupement de noms en double" };

const decaler = jours => {
  const d = new Date(); d.setDate(d.getDate() - jours);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Tous les mouvements du parc : constats d'inventaire et remises de matériel (décharges)
export default function Historique({ version, decharges, equipements = [], onOuvrirEquipement, onOuvrirDecharge }) {
  const [releves, setReleves] = useState([]);
  const [attributions, setAttributions] = useState([]);
  const [autres, setAutres] = useState([]);
  const [journal, setJournal] = useState([]);
  const [etat, setEtat] = useState("chargement");
  const [recherche, setRecherche] = useState("");
  const [type, setType] = useState("");
  const [agent, setAgent] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    Promise.all([apiEquipements.tousReleves(), apiEquipements.toutesAttributions(), apiEquipements.tousMouvements(), apiEquipements.toutJournal()])
      .then(([r, a, m, j]) => { setReleves(r); setAttributions(a); setAutres(m); setJournal(j); setEtat("ok"); })
      .catch(() => setEtat("erreur"));
  }, [version]);

  const mouvements = useMemo(() => {
    const deReleves = releves.map(r => ({
      cle: "r" + r.id, date: r.date,
      type: r.constat !== "Présent" ? "absence" : Object.keys(r.modifications || {}).length ? "completion" : "constat",
      titre: r.descriptif, sousTitre: r.numeroFiche, equipementId: r.equipementId,
      detail: `${r.constat}${r.etatPhysique ? " · " + r.etatPhysique : ""}`,
      lieu: r.site, par: r.agent,
      note: [r.commentaire, Object.keys(r.modifications || {}).length && `${Object.keys(r.modifications).length} champ(s) complété(s)`].filter(Boolean).join(" · ")
    }));
    const deDecharges = decharges.map(d => ({
      cle: "d" + d.id, date: d.dateRemise, type: "remise",
      titre: (d.articles || []).map(a => a.designation).join(", "), sousTitre: d.numero, dechargeId: d.id,
      detail: d.beneficiaireNom + (d.beneficiaireFonction ? ` · ${d.beneficiaireFonction}` : ""),
      lieu: d.structure, par: d.creePar || "", note: ""
    }));
    const deAttributions = attributions.map(a => ({
      cle: "a" + a.id, date: a.du || "", type: "reattribution",
      titre: a.descriptif, sousTitre: a.numeroFiche, equipementId: a.equipementId,
      detail: a.aPrecedent ? `${a.precedent || "En stock"} → ${a.detenteur || "En stock"}` : `Attribué à ${a.detenteur || "stock"}`,
      lieu: a.direction || a.site, par: a.saisiPar || (a.origine === "import" ? "Fichier Excel" : ""),
      note: [a.motif, a.commentaire].filter(Boolean).join(" · ")
    }));
    const deMouvements = autres.map(m => {
      const t = TYPES_MOUVEMENT[m.type] || { libelle: m.type, groupe: "modification" };
      return {
        cle: "m" + m.id, date: m.date, type: t.groupe,
        titre: m.descriptif, sousTitre: m.numeroFiche, equipementId: m.equipementId,
        detail: t.libelle + (m.destinataire ? ` — ${m.destinataire}` : "") + (t.sortie && !m.closLe ? (m.retourPrevu && m.retourPrevu < aujourdhui() ? " (en retard)" : " (en cours)") : ""),
        lieu: m.modifications?.site?.apres || m.siteActuel, par: m.saisiPar || "",
        note: [m.motif, m.piece && `pièce : ${m.piece}`, m.commentaire, decrireModifications(m.modifications)].filter(Boolean).join(" · ")
      };
    });
    const deJournal = journal.map(j => ({
      cle: "j" + j.id, date: dateLocale(j.creeLe), type: "modification",
      titre: j.descriptif, sousTitre: j.numeroFiche, equipementId: j.equipementId,
      detail: SOURCES[j.source] || "Modification de la fiche", lieu: "", par: j.auteur || "Application",
      note: decrireModifications(j.modifications)
    }));
    return [...deReleves, ...deDecharges, ...deAttributions, ...deMouvements, ...deJournal]
      .sort((a, b) => b.date.localeCompare(a.date) || b.cle.localeCompare(a.cle));
  }, [releves, decharges, attributions, autres, journal]);
  const sorties = equipements.filter(e => e.sortieEnCours);
  const retards = sorties.filter(e => enRetard(e.sortieEnCours));

  const agents = useMemo(() => [...new Set(mouvements.map(m => m.par).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [mouvements]);

  const q = norm(recherche);
  const lignes = mouvements.filter(m =>
    (!type || m.type === type) && (!agent || m.par === agent) &&
    (!debut || m.date >= debut) && (!fin || m.date <= fin) &&
    (!q || norm([m.titre, m.sousTitre, m.detail, m.lieu, m.par, m.note].join(" ")).includes(q)));

  useEffect(() => setPage(1), [recherche, type, agent, debut, fin]);
  const nbPages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const compte = t => mouvements.filter(m => m.type === t).length;
  const periode = (de, a = aujourdhui()) => { setDebut(de); setFin(a); };
  const debutMois = aujourdhui().slice(0, 8) + "01";

  return (
    <div className="pile">
      <PageTete icone="historique" titre="Historique" sous="Tous les mouvements du parc : inventaires, réattributions, remises, déplacements, prêts, réparations et modifications de fiche" />

      {retards.length > 0 && (
        <div className="notice">
          <b>{retards.length} retour(s) en retard :</b>
          <ul className="ecarts">
            {retards.map(e => (
              <li key={e.id}><button className="lien-btn lien" onClick={() => onOuvrirEquipement(e.id)}>{e.descriptif}</button>
                {e.numeroFiche && <span className="mono"> ({e.numeroFiche})</span>} — {libelleSortie(e.sortieEnCours)}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="kpis">
        <Carte titre="Total" valeur={mouvements.length} sous="tous les mouvements" icone="historique" teinte="bleu" />
        <Carte titre="Constats" valeur={compte("constat") + compte("completion")} sous={`dont ${compte("completion")} avec complétion`} icone="ok" teinte="vert" />
        <Carte titre="Absences" valeur={compte("absence")} sous="absents, volés ou perdus" icone="absent" teinte="rouge" />
        <Carte titre="Remises" valeur={compte("remise")} sous="décharges de matériel" icone="remis" teinte="violet" />
        <Carte titre="Réattributions" valeur={compte("reattribution")} sous="changements de détenteur" icone="utilisateur" teinte="orange" />
        <Carte titre="Autres mouvements" valeur={["deplacement", "reparation", "pret", "incident", "statut", "modification"].reduce((t, k) => t + compte(k), 0)}
          sous="déplacements, prêts, réparations, fiches" icone="lieu" teinte="bleu" />
        <Carte titre="Sorties en cours" valeur={sorties.length} sous={retards.length ? `dont ${retards.length} en retard` : "prêts et réparations"} icone="alerte" teinte={retards.length ? "rouge" : "violet"} />
      </section>

      <section className="filtres">
        <label className="field grand"><span className="label">Équipement, n° de fiche ou personne</span>
          <input type="search" value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="ex. ProBook, BS-MAT.INFO, KOUAME…" /></label>
        <label className="field"><span className="label">Type</span>
          <select value={type} onChange={e => setType(e.target.value)}>
            <option value="">Tous types</option>
            {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.libelle}</option>)}
          </select></label>
        <label className="field"><span className="label">Fait par</span>
          <select value={agent} onChange={e => setAgent(e.target.value)}>
            <option value="">Tous</option>{agents.map(a => <option key={a}>{a}</option>)}
          </select></label>
        <label className="field"><span className="label">Début</span><input type="date" value={debut} onChange={e => setDebut(e.target.value)} /></label>
        <label className="field"><span className="label">Fin</span><input type="date" value={fin} onChange={e => setFin(e.target.value)} /></label>
        <div className="raccourcis">
          <span className="label">Période :</span>
          <button className="pilule" onClick={() => periode(aujourdhui())}>Aujourd’hui</button>
          <button className="pilule" onClick={() => periode(decaler(7))}>7 jours</button>
          <button className="pilule" onClick={() => periode(decaler(30))}>30 jours</button>
          <button className="pilule" onClick={() => periode(debutMois)}>Ce mois</button>
          {(debut || fin || type || agent || recherche) && (
            <button className="pilule" onClick={() => { setDebut(""); setFin(""); setType(""); setAgent(""); setRecherche(""); }}>Tout effacer</button>
          )}
        </div>
      </section>

      <section className="panneau sans-marge">
        <div className="tableau-tete">
          <span className="muted">{lignes.length} mouvement(s)</span>
          <span className="muted">Page {page} sur {nbPages}</span>
        </div>
        {etat === "erreur" ? <div className="notice">Historique indisponible : serveur injoignable.</div>
          : !lignes.length ? (
            <div className="empty"><p className="muted" style={{ margin: 0 }}>
              {mouvements.length ? "Aucun mouvement ne correspond à ces filtres." : "Aucun mouvement pour l’instant : les constats d’inventaire et les décharges apparaîtront ici."}
            </p></div>
          ) : (
            <div className="tablebox nu">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Équipement</th><th>Détail</th><th>Lieu</th><th>Fait par</th><th>Note</th></tr></thead>
                <tbody>
                  {lignes.slice((page - 1) * PAR_PAGE, page * PAR_PAGE).map(m => {
                    const t = TYPES[m.type];
                    const ouvrir = () => (m.equipementId ? onOuvrirEquipement(m.equipementId) : onOuvrirDecharge(m.dechargeId));
                    return (
                      <tr key={m.cle} className="click" tabIndex={0} onClick={ouvrir} onKeyDown={ev => ev.key === "Enter" && ouvrir()}>
                        <td className="mono nowrap">{fmtDate(m.date)}</td>
                        <td><span className={"chip " + t.classe}><Icone nom={t.icone} taille={13} /> {t.libelle}</span></td>
                        <td><span className="lien">{m.titre}</span><br /><span className="muted mono">{m.sousTitre}</span></td>
                        <td>{m.detail}</td>
                        <td>{m.lieu || "—"}</td>
                        <td>{m.par || "—"}</td>
                        <td className="muted">{m.note || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        <Pagination page={page} nbPages={nbPages} setPage={setPage} />
      </section>
    </div>
  );
}

function Carte({ titre, valeur, sous, icone, teinte }) {
  return (
    <div className={"kpi petit " + teinte}>
      <div className="kpi-tete"><span className="label">{titre}</span><span className="kpi-ico"><Icone nom={icone} /></span></div>
      <b className="kpi-valeur">{valeur}</b>
      <span className="muted kpi-sous">{sous}</span>
    </div>
  );
}
