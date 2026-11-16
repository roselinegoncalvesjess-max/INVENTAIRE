import { useMemo, useState } from "react";
import { apiEquipements } from "../api.js";
import { fmtDate, manquants, norm, seriesEnDouble } from "../utils.js";
import FicheInventaire from "./FicheInventaire.jsx";
import Icone from "./Icone.jsx";
import { PageTete } from "./Commun.jsx";

const VUES = {
  tous: "Tous les équipements",
  afaire: "Pas encore inventoriés",
  faits: "Déjà inventoriés",
  incomplets: "Informations manquantes",
  absents: "Absents ou volés",
  anomalies: "Anomalies de l’import Excel"
};

const filtreVue = {
  tous: () => true,
  afaire: e => !e.inventorieLe,
  faits: e => !!e.inventorieLe,
  incomplets: e => e.manquants.length > 0,
  absents: e => e.constat && e.constat !== "Présent",
  anomalies: e => !!e.anomalieImport
};

const trier = list => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

// Inventaire physique : on parcourt le registre importé, on constate la présence de chaque
// équipement et on complète les informations manquantes.
export default function InventairePhysique({ equipements, etat, onEnregistre, peutModifier, agent, onOuvrirEquipement }) {
  const [recherche, setRecherche] = useState("");
  const [site, setSite] = useState("");
  const [categorie, setCategorie] = useState("");
  const [vue, setVue] = useState("tous");
  const [ouvert, setOuvert] = useState(null); // id de l'équipement, ou "nouveau"

  const items = useMemo(() => equipements.map(e => ({ ...e, manquants: manquants(e) })), [equipements]);
  const doubles = useMemo(() => seriesEnDouble(equipements), [equipements]);
  const sites = useMemo(() => trier(equipements.map(e => e.site)), [equipements]);
  const categories = useMemo(() => trier(equipements.map(e => e.categorie)), [equipements]);

  const total = items.length;
  const faits = items.filter(e => e.inventorieLe).length;
  const complets = items.filter(e => !e.manquants.length).length;
  const absents = items.filter(filtreVue.absents).length;

  const q = norm(recherche);
  const lignes = items.filter(e => {
    if (site && e.site !== site) return false;
    if (categorie && e.categorie !== categorie) return false;
    if (!filtreVue[vue](e)) return false;
    if (!q) return true;
    return norm([e.numeroFiche, e.identifiant, e.descriptif, e.categorie, e.referenceSerie, e.utilisateur,
      e.site, e.direction, e.emplacement, e.numOrdre].join(" ")).includes(q);
  });

  // Après « Enregistrer et suivant » : l'équipement suivant de la liste filtrée
  const suivantDe = id => {
    const i = lignes.findIndex(e => e.id === id);
    return i >= 0 && i + 1 < lignes.length ? lignes[i + 1].id : null;
  };

  const enregistrer = async (id, data, allerAuSuivant) => {
    const suivant = allerAuSuivant ? suivantDe(id) : null;
    const saved = id === "nouveau" ? await apiEquipements.ajouter(data) : await apiEquipements.inventorier(id, data);
    await onEnregistre(id === "nouveau" ? "Équipement ajouté au registre" : `${saved.numeroFiche || saved.descriptif} : inventaire enregistré`);
    setOuvert(suivant);
  };

  // En lecture seule, une ligne ouvre la fiche de l'équipement au lieu du formulaire de constat
  const ouvrirLigne = id => (peutModifier ? setOuvert(id) : onOuvrirEquipement(id));
  const fiche = ouvert === "nouveau" ? null : items.find(e => e.id === ouvert);

  return (
    <div className="pile">
      <PageTete icone="inventaire" titre="Inventaire physique" sous="Constatez la présence de chaque équipement et complétez les informations manquantes">
        <a className="btn" href={apiEquipements.urlExport} download><Icone nom="export" taille={16} />Exporter CSV</a>
        {peutModifier && <button className="btn primary" onClick={() => setOuvert("nouveau")}><Icone nom="plus" taille={16} />Équipement non répertorié</button>}
      </PageTete>
      <div className="progress">
        <Jauge valeur={faits} total={total} libelle="Inventoriés" />
        <Jauge valeur={complets} total={total} libelle="Fiches complètes" />
        <div className="jauge"><span className="label">Absents ou volés</span><b className={absents ? "alerte" : ""}>{absents}</b></div>
        <div className="jauge"><span className="label">Reste à inventorier</span><b>{total - faits}</b></div>
      </div>

      <section className="filtres">
        <label className="field grand"><span className="label">Recherche</span>
          <input type="search" value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="N° de fiche, n° de série, descriptif, utilisateur…" /></label>
        <label className="field"><span className="label">Vue</span>
          <select value={vue} onChange={e => setVue(e.target.value)}>
            {Object.entries(VUES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="field"><span className="label">Site</span>
          <select value={site} onChange={e => setSite(e.target.value)}>
            <option value="">Tous les sites</option>
            {sites.map(s => <option key={s}>{s}</option>)}
          </select></label>
        <label className="field"><span className="label">Catégorie</span>
          <select value={categorie} onChange={e => setCategorie(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map(s => <option key={s}>{s}</option>)}
          </select></label>
      </section>

      {etat === "ok" && !total ? (
        <div className="empty">
          <h2>Le registre est vide</h2>
          <p className="muted" style={{ margin: 0, maxWidth: "56ch" }}>
            Importez le fichier Excel du parc : dans le dossier <code>server</code>, lancez <code>npm run import</code>.
          </p>
        </div>
      ) : !lignes.length ? (
        <div className="empty"><p className="muted" style={{ margin: 0 }}>Aucun équipement ne correspond à ces filtres.</p></div>
      ) : (
        <>
          <section className="panneau sans-marge">
          <div className="tableau-tete"><span className="muted">{lignes.length} équipement(s) · cliquez sur une ligne pour saisir le constat</span></div>
          <div className="tablebox nu">
            <table>
              <thead>
                <tr><th>N° fiche</th><th>Équipement</th><th>N° de série</th><th>Utilisateur</th><th>Site · emplacement</th><th>Statut</th><th>Inventaire</th><th>À compléter</th></tr>
              </thead>
              <tbody>
                {lignes.map(e => (
                  <tr key={e.id} className="click" tabIndex={0}
                    onClick={() => ouvrirLigne(e.id)} onKeyDown={ev => ev.key === "Enter" && ouvrirLigne(e.id)}>
                    <td className="mono">{e.numeroFiche || <span className="muted">—</span>}</td>
                    <td><b>{e.descriptif}</b><br /><span className="muted">{e.categorie}</span></td>
                    <td className="mono">
                      {e.referenceSerie || "—"}
                      {e.referenceSerie && doubles.has(norm(e.referenceSerie)) && <> <span className="chip dup">en double</span></>}
                    </td>
                    <td>{e.utilisateur || "—"}</td>
                    <td>{e.site || "—"}{e.emplacement && <><br /><span className="muted">{e.emplacement}</span></>}</td>
                    <td>{e.statut || "—"}</td>
                    <td>
                      {e.inventorieLe ? (
                        <><span className={"chip " + (e.constat === "Présent" ? "ok" : "dup")}>{e.constat}</span><br />
                          <span className="muted mono">{fmtDate(e.inventorieLe)}</span></>
                      ) : <span className="chip">À faire</span>}
                    </td>
                    <td>
                      {e.manquants.length
                        ? <span className="chip ex" title={e.manquants.join(", ")}>{e.manquants.length} info{e.manquants.length > 1 ? "s" : ""}</span>
                        : <span className="chip ok">Complet</span>}
                      {e.anomalieImport && <> <span className="chip dup" title={e.anomalieImport}>import</span></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </section>
        </>
      )}

      {(ouvert === "nouveau" || fiche) && (
        <FicheInventaire
          key={ouvert}
          equipement={fiche}
          equipements={equipements}
          agent={agent}
          aSuivant={ouvert !== "nouveau" && suivantDe(ouvert) !== null}
          onEnregistrer={(data, suivant) => enregistrer(ouvert, data, suivant)}
          onFermer={() => setOuvert(null)} />
      )}
    </div>
  );
}

function Jauge({ valeur, total, libelle }) {
  const pct = total ? Math.round((valeur / total) * 100) : 0;
  return (
    <div className="jauge">
      <span className="label">{libelle}</span>
      <b>{valeur}<small> / {total}</small></b>
      <div className="barre" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={libelle}>
        <span style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}
