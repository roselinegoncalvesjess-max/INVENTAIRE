import { useEffect, useMemo, useState } from "react";
import { apiEquipements } from "../api.js";
import { compter, norm, STATUT_STYLE, TYPES_BENEFICIAIRE } from "../utils.js";
import { PastilleType } from "./Beneficiaires.jsx";
import Icone from "./Icone.jsx";
import { Pagination, PageTete, Statut } from "./Commun.jsx";
import { codeEquipement } from "./Etiquettes.jsx";

const PAR_PAGE = 25;
const trier = l => [...new Set(l.filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

export default function Equipements({ equipements, recherche, setRecherche, onOuvrir }) {
  const [categorie, setCategorie] = useState("");
  const [site, setSite] = useState("");
  const [statut, setStatut] = useState("");
  const [reattribues, setReattribues] = useState(false);
  const [typeB, setTypeB] = useState("");
  const [district, setDistrict] = useState("");
  const [page, setPage] = useState(1);

  const categories = useMemo(() => trier(equipements.map(e => e.categorie)), [equipements]);
  const sites = useMemo(() => trier(equipements.map(e => e.site)), [equipements]);
  const districts = useMemo(() => trier(equipements.map(e => e.district)), [equipements]);
  const parType = useMemo(() => compter(equipements, "typeBeneficiaire"), [equipements]);
  const statuts = useMemo(() => compter(equipements, "statut"), [equipements]);

  const q = norm(recherche);
  const lignes = equipements.filter(e => {
    if (categorie && e.categorie !== categorie) return false;
    if (site && e.site !== site) return false;
    if (statut && (e.statut || "Non renseigné") !== statut) return false;
    if (reattribues && !(e.nbDetenteurs > 1)) return false;
    if (typeB && e.typeBeneficiaire !== typeB) return false;
    if (district && e.district !== district) return false;
    return !q || norm([codeEquipement(e), e.identifiant, e.descriptif, e.categorie, e.referenceSerie, e.utilisateur,
      e.anciensDetenteurs, e.structureNom, e.district, e.region, e.site, e.direction, e.emplacement, e.numOrdre].join(" ")).includes(q);
  });

  useEffect(() => setPage(1), [recherche, categorie, site, statut, reattribues, typeB, district]);
  const nbPages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const visibles = lignes.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);
  const filtre = recherche || categorie || site || statut || reattribues || typeB || district;
  const nbReattribues = equipements.filter(e => e.nbDetenteurs > 1).length;
  // La recherche a trouvé l’appareil par un ancien détenteur (et non par le détenteur actuel)
  const parAncien = e => q && e.anciensDetenteurs && norm(e.anciensDetenteurs).includes(q) && !norm(e.utilisateur).includes(q);

  return (
    <div className="pile">
      <PageTete icone="equipement" titre="Équipements" sous="Registre du parc importé du fichier Excel">
        <a className="btn" href={apiEquipements.urlExport} download><Icone nom="export" taille={16} />Exporter CSV</a>
      </PageTete>

      <section className="kpis">
        <Mini titre="Total équipements" valeur={equipements.length} sous="tous statuts confondus" icone="equipement" teinte="bleu"
          actif={!statut} onClick={() => setStatut("")} />
        <Mini titre="En service" valeur={statuts["En service"] || 0} sous="en utilisation" icone="ok" teinte="vert"
          actif={statut === "En service"} onClick={() => setStatut("En service")} />
        <Mini titre="Pas encore en service" valeur={statuts["Pas encore en service"] || 0} sous="en attente d’affectation" icone="remis" teinte="violet"
          actif={statut === "Pas encore en service"} onClick={() => setStatut("Pas encore en service")} />
        <Mini titre="Inactifs" valeur={(statuts["Inactif"] || 0) + (statuts["Hors service"] || 0)} sous="dont hors service" icone="alerte" teinte="orange"
          actif={statut === "Inactif"} onClick={() => setStatut("Inactif")} />
      </section>

      <section className="filtres">
        <label className="field grand"><span className="label">Recherche</span>
          <input type="search" value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Descriptif, n° de fiche, n° de série, détenteur actuel ou ancien…" /></label>
        <label className="field"><span className="label">Catégorie</span>
          <select value={categorie} onChange={e => setCategorie(e.target.value)}>
            <option value="">Toutes</option>{categories.map(c => <option key={c}>{c}</option>)}
          </select></label>
        <label className="field"><span className="label">Site</span>
          <select value={site} onChange={e => setSite(e.target.value)}>
            <option value="">Tous</option>{sites.map(c => <option key={c}>{c}</option>)}
          </select></label>
        <label className="field"><span className="label">Bénéficiaire</span>
          <select value={typeB} onChange={e => setTypeB(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(TYPES_BENEFICIAIRE).map(([k, t]) => <option key={k} value={k}>{t.libelle} ({parType[k] || 0})</option>)}
          </select></label>
        {districts.length > 0 && (
          <label className="field"><span className="label">District sanitaire</span>
            <select value={district} onChange={e => setDistrict(e.target.value)}>
              <option value="">Tous</option>{districts.map(c => <option key={c}>{c}</option>)}
            </select></label>
        )}
        <label className="field"><span className="label">Statut</span>
          <select value={statut} onChange={e => setStatut(e.target.value)}>
            <option value="">Tous</option>{Object.keys(STATUT_STYLE).map(c => <option key={c}>{c}</option>)}
          </select></label>
        <label className="case" style={{ alignSelf: "end", paddingBottom: 10 }}>
          <input type="checkbox" checked={reattribues} onChange={e => setReattribues(e.target.checked)} />
          Réattribués uniquement ({nbReattribues})
        </label>
        {filtre && <button className="btn" onClick={() => { setRecherche(""); setCategorie(""); setSite(""); setStatut(""); setReattribues(false); setTypeB(""); setDistrict(""); }}>Effacer</button>}
      </section>

      <section className="panneau sans-marge">
        <div className="tableau-tete">
          <span className="muted">{lignes.length} équipement(s) trouvé(s)</span>
          <span className="muted">Page {page} sur {nbPages}</span>
        </div>
        {!lignes.length ? (
          <div className="empty"><p className="muted" style={{ margin: 0 }}>Aucun équipement ne correspond à ces filtres.</p></div>
        ) : (
          <div className="tablebox nu">
            <table>
              <thead>
                <tr><th>N° fiche</th><th>Équipement</th><th>N° de série</th><th>Statut</th><th>Détenteur</th><th>Site · emplacement</th><th aria-label="Ouvrir" /></tr>
              </thead>
              <tbody>
                {visibles.map(e => (
                  <tr key={e.id} className="click" tabIndex={0}
                    onClick={() => onOuvrir(e.id)} onKeyDown={ev => ev.key === "Enter" && onOuvrir(e.id)}>
                    <td className="mono nowrap">{e.numeroFiche || <span className="muted">—</span>}</td>
                    <td>
                      <div className="cellule-equip">
                        <span className="equip-ico"><Icone nom="equipement" taille={16} /></span>
                        <span><b>{e.descriptif}</b><br /><span className="muted">{e.categorie}</span></span>
                      </div>
                    </td>
                    <td className="mono">{e.referenceSerie || "—"}</td>
                    <td><Statut valeur={e.statut} /></td>
                    <td>
                      <PastilleType type={e.typeBeneficiaire} court /><br />
                      {e.utilisateur || <span className="muted">En stock</span>}
                      {e.district && e.typeBeneficiaire === "site" && <span className="muted petit-texte"> · {e.district}</span>}
                      {e.nbDetenteurs > 1 && <span className="chip violet reattribue" title={`Précédent : ${e.detenteurPrecedent || "en stock"}`}>Réattribué</span>}
                      {parAncien(e) && <><br /><span className="muted petit-texte">Ancien détenteur : {e.anciensDetenteurs}</span></>}
                    </td>
                    <td>{e.site || "—"}{e.emplacement && <><br /><span className="muted">{e.emplacement}</span></>}</td>
                    <td><span className="btn-ico" aria-hidden="true"><Icone nom="oeil" taille={16} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} nbPages={nbPages} setPage={setPage} />
      </section>
    </div>
  );
}

function Mini({ titre, valeur, sous, icone, teinte, actif, onClick }) {
  return (
    <button className={"kpi petit click " + teinte + (actif ? " actif" : "")} onClick={onClick} aria-pressed={actif}>
      <div className="kpi-tete"><span className="label">{titre}</span><span className="kpi-ico"><Icone nom={icone} /></span></div>
      <b className="kpi-valeur">{valeur}</b>
      <span className="muted kpi-sous">{sous}</span>
    </button>
  );
}
