import { useEffect, useState } from "react";
import { fmtDate } from "../utils.js";

// Fiche d'une décharge, affichée par-dessus la liste
export default function FicheDecharge({ decharge: d, onFermer, onModifier, onSupprimer }) {
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState("");
  const arts = d.articles || [];

  useEffect(() => {
    const echap = e => e.key === "Escape" && onFermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [onFermer]);

  const supprimer = async () => {
    try { await onSupprimer(); } catch (e) { setErreur("Suppression impossible : " + e.message); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onFermer()}>
      <div className="card" role="dialog" aria-modal="true" aria-labelledby="dtTitle">
        <span className="stampmark">Remis</span>
        <div style={{ display: "grid", gap: 4, paddingRight: 90 }}>
          <span className="label">Décharge de remise de matériel{d.creePar ? ` · saisie par ${d.creePar}` : ""}</span>
          <h2 id="dtTitle" className="mono" style={{ fontFamily: "var(--f-mono)", fontSize: "1.15rem" }}>{d.numero}</h2>
        </div>

        <div className="kv">
          <div><span className="label">Date de remise</span><span className="mono">{fmtDate(d.dateRemise)}</span></div>
          <div><span className="label">Structure bénéficiaire</span><span>{d.structure}</span></div>
          <div><span className="label">Bénéficiaire</span><b>{d.beneficiaireNom}</b></div>
          <div><span className="label">Fonction</span><span>{d.beneficiaireFonction || "—"}</span></div>
          <div><span className="label">Téléphone</span><span className="mono">{d.beneficiaireTelephone || "—"}</span></div>
        </div>

        <div className="tablebox">
          <table>
            <thead><tr><th>Désignation</th><th className="num">Qté</th><th>Identifiant</th><th>IMEI</th><th>N° de série</th></tr></thead>
            <tbody>
              {arts.map(a => (
                <tr key={a.id}>
                  <td>{a.designation}</td>
                  <td className="num">{a.quantite}</td>
                  <td className="mono">{a.identifiant || "—"}</td>
                  <td className="mono">{a.imei || "—"}</td>
                  <td className="mono">{a.numeroSerie || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {confirmer && (
          <div className="confirm">
            <span style={{ flex: "1 1 220px" }}>
              Supprimer définitivement la décharge <b className="mono">{d.numero}</b> et ses {arts.length} ligne(s) de matériel ?
            </span>
            <button className="btn" onClick={() => setConfirmer(false)}>Annuler</button>
            <button className="btn danger" onClick={supprimer}>Oui, supprimer</button>
          </div>
        )}
        {erreur && <p className="notice">{erreur}</p>}

        <div className="actions" style={{ justifyContent: "space-between" }}>
          {onSupprimer ? <button className="btn danger" onClick={() => setConfirmer(true)}>Supprimer</button> : <span />}
          <div className="toolbar">
            <button className="btn" onClick={onFermer} autoFocus>Fermer</button>
            {onModifier && <button className="btn primary" onClick={onModifier}>Modifier</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
