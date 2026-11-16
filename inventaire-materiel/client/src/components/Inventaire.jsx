import { useMemo, useState } from "react";
import { api } from "../api.js";
import { doublons, fmtDate, norm } from "../utils.js";
import { BarreFiltres, PageTete, Vide } from "./Commun.jsx";
import Icone from "./Icone.jsx";

// Vue à plat : un équipement par ligne, avec son détenteur et sa structure
export default function Inventaire({ items, structures, onOuvrir, onNouvelle }) {
  const [recherche, setRecherche] = useState("");
  const [structure, setStructure] = useState("");
  const dups = useMemo(() => doublons(items), [items]);

  const q = norm(recherche);
  const lignes = items.filter(a => {
    if (structure && a.decharge.structure !== structure) return false;
    if (!q) return true;
    return norm([a.designation, a.identifiant, a.imei, a.numeroSerie, a.decharge.beneficiaireNom, a.decharge.structure].join(" ")).includes(q);
  });

  return (
    <div className="pile">
      <PageTete icone="remis" titre="Matériel remis" sous="Un équipement par ligne, avec son détenteur et sa structure">
        {onNouvelle && <button className="btn primary" onClick={onNouvelle}><Icone nom="plus" taille={16} />Nouvelle décharge</button>}
      </PageTete>
      <BarreFiltres
        recherche={recherche} setRecherche={setRecherche}
        structure={structure} setStructure={setStructure} structures={structures}
        placeholder="Rechercher par désignation, identifiant, IMEI ou n° de série…"
        urlExport={api.urlExportInventaire} />

      {!items.length ? (
        <Vide titre="L’inventaire est vide" onNouvelle={onNouvelle}>
          Chaque équipement d’une décharge (désignation, identifiant, IMEI, n° de série) est listé ici, avec la structure et la personne qui le détient.
        </Vide>
      ) : !lignes.length ? (
        <div className="empty"><p className="muted" style={{ margin: 0 }}>Aucun équipement ne correspond à cette recherche.</p></div>
      ) : (
        <div className="tablebox">
          <table>
            <thead>
              <tr><th>Désignation</th><th className="num">Qté</th><th>Identifiant</th><th>IMEI</th><th>N° de série</th><th>Détenteur</th><th>Structure</th><th>Remis le</th></tr>
            </thead>
            <tbody>
              {lignes.map(a => (
                <tr key={a.id} className="click" tabIndex={0}
                  onClick={() => onOuvrir(a.decharge.id)} onKeyDown={e => e.key === "Enter" && onOuvrir(a.decharge.id)}>
                  <td><b>{a.designation}</b></td>
                  <td className="num">{a.quantite}</td>
                  <td className="mono">{a.identifiant || "—"}</td>
                  <td className="mono">{a.imei || "—"} {a.imei && dups.has("i:" + a.imei) && <span className="chip dup">doublon</span>}</td>
                  <td className="mono">{a.numeroSerie || "—"} {a.numeroSerie && dups.has("s:" + norm(a.numeroSerie)) && <span className="chip dup">doublon</span>}</td>
                  <td>{a.decharge.beneficiaireNom}</td>
                  <td>{a.decharge.structure}</td>
                  <td className="mono">{fmtDate(a.decharge.dateRemise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
