import { useState } from "react";
import { api } from "../api.js";
import { fmtDate, norm, quantiteTotale } from "../utils.js";
import { BarreFiltres, PageTete, Vide } from "./Commun.jsx";
import Icone from "./Icone.jsx";

export default function ListeDecharges({ decharges, structures, onOuvrir, onNouvelle }) {
  const [recherche, setRecherche] = useState("");
  const [structure, setStructure] = useState("");

  const q = norm(recherche);
  const lignes = decharges.filter(d => {
    if (structure && d.structure !== structure) return false;
    if (!q) return true;
    return norm([d.numero, d.structure, d.beneficiaireNom, d.beneficiaireFonction, d.beneficiaireTelephone,
      ...(d.articles || []).map(a => a.designation)].join(" ")).includes(q);
  });

  return (
    <div className="pile">
      <PageTete icone="decharge" titre="Décharges" sous="Remises de matériel signées par les bénéficiaires">
        {onNouvelle && <button className="btn primary" onClick={onNouvelle}><Icone nom="plus" taille={16} />Nouvelle décharge</button>}
      </PageTete>
      <BarreFiltres
        recherche={recherche} setRecherche={setRecherche}
        structure={structure} setStructure={setStructure} structures={structures}
        placeholder="Rechercher un bénéficiaire, une structure, un n° de décharge…"
        urlExport={api.urlExportDecharges} />

      {!decharges.length ? (
        <Vide titre="Aucune décharge enregistrée" onNouvelle={onNouvelle}>
          Saisissez votre première décharge de remise : la date, la structure, le bénéficiaire et le matériel remis.
        </Vide>
      ) : !lignes.length ? (
        <div className="empty"><p className="muted" style={{ margin: 0 }}>Aucune décharge ne correspond à cette recherche.</p></div>
      ) : (
        <div className="tablebox">
          <table>
            <thead>
              <tr><th>N° décharge</th><th>Date</th><th>Structure</th><th>Bénéficiaire</th><th>Fonction</th><th>Matériel</th><th className="num">Qté</th></tr>
            </thead>
            <tbody>
              {lignes.map(d => {
                const des = (d.articles || []).map(a => a.designation).filter(Boolean);
                return (
                  <tr key={d.id} className="click" tabIndex={0}
                    onClick={() => onOuvrir(d.id)} onKeyDown={e => e.key === "Enter" && onOuvrir(d.id)}>
                    <td className="mono">{d.numero}</td>
                    <td className="mono">{fmtDate(d.dateRemise)}</td>
                    <td>{d.structure}</td>
                    <td><b>{d.beneficiaireNom}</b><br /><span className="muted mono">{d.beneficiaireTelephone}</span></td>
                    <td>{d.beneficiaireFonction || "—"}</td>
                    <td>{des.slice(0, 2).join(", ")}{des.length > 2 && <span className="muted"> +{des.length - 2}</span>}</td>
                    <td className="num">{quantiteTotale(d.articles)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
