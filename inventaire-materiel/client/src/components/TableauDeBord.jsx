import { useMemo } from "react";
import { apiEquipements } from "../api.js";
import { compter, fmtCompact, fmtMontant, manquants, STATUT_STYLE } from "../utils.js";
import Icone from "./Icone.jsx";
import { Anneau, Barres, Colonnes, regrouper } from "./Graphiques.jsx";

export default function TableauDeBord({ equipements, decharges, dateDuJour, onAller, onOuvrirEquipement }) {
  const s = useMemo(() => {
    const total = equipements.length;
    const somme = k => equipements.reduce((t, e) => t + (Number(e[k]) || 0), 0);
    const annee = new Date().getFullYear();
    const parAnnee = compter(equipements.filter(e => e.dateDebut), e => e.dateDebut.slice(0, 4));
    const annees = Object.keys(parAnnee).map(Number);
    const de = Math.max(Math.min(...annees), annee - 11);
    const colonnes = annees.length
      ? Array.from({ length: annee - de + 1 }, (_, i) => ({ libelle: String(de + i), valeur: parAnnee[de + i] || 0 }))
      : [];
    const avantDe = annees.filter(a => a < de).reduce((t, a) => t + parAnnee[a], 0);
    const statuts = compter(equipements, "statut");
    const incomplets = equipements.filter(e => manquants(e).length);
    const absents = equipements.filter(e => e.constat && e.constat !== "Présent");
    const anomalies = equipements.filter(e => e.anomalieImport);
    return {
      total, annee, colonnes, avantDe,
      enService: statuts["En service"] || 0,
      acquisCetteAnnee: parAnnee[annee] || 0,
      valeurAcquisition: somme("valeurAcquisition"),
      valeurNette: somme("valeurNette"),
      inventories: equipements.filter(e => e.inventorieLe).length,
      statuts: Object.keys(STATUT_STYLE).map(k => ({ libelle: k, valeur: statuts[k] || 0, couleur: STATUT_STYLE[k].couleur })),
      categories: regrouper(compter(equipements, "categorie"), 7),
      sites: regrouper(compter(equipements, "site"), 5),
      incomplets, absents, anomalies,
      priorites: [...absents, ...anomalies, ...incomplets.filter(e => !e.inventorieLe)]
        .filter((e, i, a) => a.findIndex(x => x.id === e.id) === i).slice(0, 6)
    };
  }, [equipements]);

  const pctInv = s.total ? Math.round((s.inventories / s.total) * 100) : 0;
  const pctService = s.total ? Math.round((s.enService / s.total) * 100) : 0;
  const alertes = s.absents.length + s.anomalies.length;

  return (
    <div className="pile">
      <section className="hero">
        <div>
          <span className="hero-avatar"><Icone nom="inventaire" taille={24} /></span>
          <div>
            <h1>Parc informatique</h1>
            <p>Direction projet LHSPLA · <span className="capitale">{dateDuJour}</span></p>
          </div>
        </div>
        <div className="hero-actions">
          <button className="btn clair" onClick={() => onAller("inventaire")}><Icone nom="inventaire" taille={16} />Inventaire physique</button>
          <a className="btn contour" href={apiEquipements.urlExport} download><Icone nom="export" taille={16} />Exporter le registre</a>
        </div>
      </section>

      <section className="kpis">
        <Kpi teinte="bleu" icone="equipement" titre="Équipements" valeur={s.total} sous="au registre"
          onClick={() => onAller("equipements")}>
          <div className="barre"><span style={{ width: pctService + "%" }} /></div>
          <div className="kpi-pied"><span>{s.enService} en service ({pctService} %)</span>
            {s.acquisCetteAnnee > 0 && <span className="chip ok">+{s.acquisCetteAnnee} en {s.annee}</span>}</div>
        </Kpi>
        <Kpi teinte="vert" icone="valeur" titre="Valeur du parc" valeur={fmtCompact(s.valeurAcquisition)} sous="FCFA d’acquisition">
          <div className="kpi-pied"><span>Valeur nette au 31/12/2024</span><span className="chip ok">{fmtCompact(s.valeurNette)} FCFA</span></div>
        </Kpi>
        <Kpi teinte="orange" icone="inventaire" titre="Inventaire physique" valeur={`${pctInv} %`} sous={`${s.inventories} / ${s.total} constatés`}
          onClick={() => onAller("inventaire")}>
          <div className="barre"><span style={{ width: pctInv + "%" }} /></div>
          <div className="kpi-pied"><span>{s.incomplets.length} fiches à compléter</span></div>
        </Kpi>
        <Kpi teinte="rouge" icone="alerte" titre="Alertes" valeur={alertes} sous="absents, volés, anomalies">
          <div className="kpi-pied"><span>{s.absents.length} absent(s) · {s.anomalies.length} anomalie(s) d’import</span></div>
        </Kpi>
      </section>

      <section className="grille-2">
        <div className="panneau">
          <div className="panneau-tete">
            <h2>Acquisitions par année</h2>
            <p className="muted">Nombre d’équipements par date de mise en service{s.avantDe ? ` · ${s.avantDe} avant ${s.colonnes[0]?.libelle}` : ""}</p>
          </div>
          {s.colonnes.length ? <Colonnes donnees={s.colonnes} /> : <p className="muted">Aucune date d’acquisition.</p>}
        </div>
        <div className="panneau">
          <div className="panneau-tete">
            <h2>Répartition par statut</h2>
            <p className="muted">État d’utilisation déclaré dans le registre</p>
          </div>
          <Anneau donnees={s.statuts} total={s.total} libelleTotal="équipements" />
        </div>
      </section>

      <section className="grille-2">
        <div className="panneau">
          <div className="panneau-tete"><h2>Par catégorie</h2><p className="muted">Nombre d’équipements</p></div>
          <Barres donnees={s.categories} total={s.total} />
        </div>
        <div className="panneau">
          <div className="panneau-tete"><h2>Par site</h2><p className="muted">Nombre d’équipements</p></div>
          <Barres donnees={s.sites} total={s.total} />
        </div>
      </section>

      <section className="grille-2">
        <div className="panneau">
          <div className="panneau-tete ligne">
            <div><h2>À traiter en priorité</h2><p className="muted">Absents, anomalies d’import, fiches incomplètes non inventoriées</p></div>
            <button className="btn" onClick={() => onAller("inventaire")}>Tout voir</button>
          </div>
          {s.priorites.length ? (
            <ul className="liste-simple">
              {s.priorites.map(e => (
                <li key={e.id} className="click" tabIndex={0} onClick={() => onOuvrirEquipement(e.id)}
                  onKeyDown={ev => ev.key === "Enter" && onOuvrirEquipement(e.id)}>
                  <span className="pastille-ico"><Icone nom={e.constat && e.constat !== "Présent" ? "absent" : "alerte"} taille={16} /></span>
                  <span><b>{e.descriptif}</b><br /><span className="muted mono">{e.numeroFiche || "sans n° de fiche"}</span></span>
                  <span className="chip ex">
                    {e.constat && e.constat !== "Présent" ? e.constat : e.anomalieImport ? "Anomalie import" : `${manquants(e).length} info(s)`}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Rien à signaler.</p>}
        </div>
        <div className="panneau">
          <div className="panneau-tete ligne">
            <div><h2>Remises de matériel</h2><p className="muted">Décharges enregistrées</p></div>
            <button className="btn" onClick={() => onAller("decharges")}>Ouvrir</button>
          </div>
          <div className="chiffres">
            <div><b>{decharges.length}</b><span className="muted">décharges</span></div>
            <div><b>{decharges.reduce((t, d) => t + (d.articles || []).reduce((u, a) => u + (+a.quantite || 0), 0), 0)}</b><span className="muted">équipements remis</span></div>
            <div><b>{fmtMontant(s.valeurAcquisition)}</b><span className="muted">FCFA, valeur totale d’acquisition</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ teinte, icone, titre, valeur, sous, children, onClick }) {
  const Balise = onClick ? "button" : "div";
  return (
    <Balise className={"kpi " + teinte + (onClick ? " click" : "")} onClick={onClick}>
      <div className="kpi-tete">
        <span className="label">{titre}</span>
        <span className="kpi-ico"><Icone nom={icone} /></span>
      </div>
      <b className="kpi-valeur">{valeur}</b>
      <span className="muted kpi-sous">{sous}</span>
      {children}
    </Balise>
  );
}
