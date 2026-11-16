// Éléments réutilisés par plusieurs écrans
import Icone from "./Icone.jsx";
import { STATUT_STYLE } from "../utils.js";

export function PageTete({ icone, titre, sous, children }) {
  return (
    <div className="page-tete">
      <div className="page-titre">
        <span className="page-ico"><Icone nom={icone} taille={22} /></span>
        <div><h1>{titre}</h1>{sous && <p className="muted">{sous}</p>}</div>
      </div>
      {children && <div className="toolbar">{children}</div>}
    </div>
  );
}

export function Statut({ valeur }) {
  const v = valeur || "Non renseigné";
  return <span className={"chip " + (STATUT_STYLE[v]?.classe ?? "")}>{v}</span>;
}

export function Pagination({ page, nbPages, setPage }) {
  if (nbPages <= 1) return null;
  return (
    <div className="pagination">
      <button className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Précédente</button>
      <span className="muted">{page} / {nbPages}</span>
      <button className="btn" disabled={page === nbPages} onClick={() => setPage(page + 1)}>Suivante ›</button>
    </div>
  );
}

export function BarreFiltres({ recherche, setRecherche, structure, setStructure, structures, placeholder, urlExport }) {
  return (
    <section className="filtres">
      <label className="field grand"><span className="label">Recherche</span>
        <input type="search" value={recherche} placeholder={placeholder} onChange={e => setRecherche(e.target.value)} /></label>
      <label className="field"><span className="label">Structure</span>
        <select value={structure} onChange={e => setStructure(e.target.value)}>
          <option value="">Toutes les structures</option>
          {structures.map(s => <option key={s}>{s}</option>)}
        </select></label>
      <a className="btn" href={urlExport} download><Icone nom="export" taille={16} />Exporter CSV</a>
    </section>
  );
}

export function Vide({ titre, children, onNouvelle }) {
  return (
    <div className="empty">
      <h2>{titre}</h2>
      <p className="muted" style={{ margin: 0, maxWidth: "48ch" }}>{children}</p>
      {onNouvelle && <button className="btn primary" onClick={onNouvelle}>+ Saisir une décharge</button>}
    </div>
  );
}
