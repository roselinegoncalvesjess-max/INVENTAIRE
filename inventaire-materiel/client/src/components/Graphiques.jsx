import { useState } from "react";

// Petits graphiques SVG / HTML sans dépendance, avec info-bulle au survol.

function useInfobulle() {
  const [bulle, setBulle] = useState(null); // { x, y, titre, valeur }
  const montrer = (ev, titre, valeur) => {
    const box = ev.currentTarget.closest(".viz").getBoundingClientRect();
    const src = ev.touches?.[0] || ev;
    setBulle({ x: src.clientX - box.left, y: src.clientY - box.top, titre, valeur });
  };
  const rendu = bulle && (
    <div className="infobulle" style={{ left: bulle.x, top: bulle.y }} role="tooltip">
      <span className="muted">{bulle.titre}</span><b>{bulle.valeur}</b>
    </div>
  );
  return { montrer, cacher: () => setBulle(null), rendu };
}

const pct = (n, t) => (t ? Math.round((n / t) * 1000) / 10 : 0).toLocaleString("fr-FR");

// Histogramme vertical (une série) : [{ libelle, valeur }]
export function Colonnes({ donnees, unite = "équipement(s)", hauteur = 200 }) {
  const { montrer, cacher, rendu } = useInfobulle();
  const max = Math.max(1, ...donnees.map(d => d.valeur));
  const pas = Math.pow(10, Math.floor(Math.log10(max)));
  const haut = Math.ceil(max / pas) * pas;
  const graduations = [0, haut / 2, haut];
  const W = 600, H = hauteur, g = 34, b = 24, larg = (W - g) / donnees.length;
  const y = v => H - b - (v / haut) * (H - b - 10);

  return (
    <div className="viz" onMouseLeave={cacher}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={donnees.map(d => `${d.libelle} : ${d.valeur}`).join(", ")}>
        {graduations.map(t => (
          <g key={t}>
            <line x1={g} x2={W} y1={y(t)} y2={y(t)} className="grille" />
            <text x={g - 6} y={y(t) + 4} textAnchor="end" className="axe">{t.toLocaleString("fr-FR")}</text>
          </g>
        ))}
        {donnees.map((d, i) => {
          const w = Math.min(28, larg * 0.6), x = g + i * larg + (larg - w) / 2, top = y(d.valeur), r = Math.min(4, (H - b - top) / 2);
          return (
            <g key={d.libelle}>
              <rect x={g + i * larg} y={0} width={larg} height={H - b} fill="transparent"
                onMouseMove={ev => montrer(ev, d.libelle, `${d.valeur.toLocaleString("fr-FR")} ${unite}`)} />
              {d.valeur > 0 && (
                <path className="barre-v" pointerEvents="none"
                  d={`M${x},${H - b} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${H - b} Z`} />
              )}
              <text x={x + w / 2} y={H - 6} textAnchor="middle" className="axe">{d.libelle}</text>
            </g>
          );
        })}
      </svg>
      {rendu}
    </div>
  );
}

// Anneau de répartition : [{ libelle, valeur, couleur }]
export function Anneau({ donnees, total, libelleTotal = "total" }) {
  const { montrer, cacher, rendu } = useInfobulle();
  const R = 70, C = 2 * Math.PI * R, ecart = donnees.filter(d => d.valeur).length > 1 ? 3 : 0;
  let cumul = 0;
  return (
    <div className="anneau">
      <div className="viz" onMouseLeave={cacher}>
        <svg viewBox="0 0 180 180" width="180" height="180" role="img"
          aria-label={donnees.map(d => `${d.libelle} : ${d.valeur}`).join(", ")}>
          <g transform="rotate(-90 90 90)">
            {donnees.filter(d => d.valeur).map(d => {
              const long = (d.valeur / total) * C, debut = cumul;
              cumul += long;
              return (
                <circle key={d.libelle} cx="90" cy="90" r={R} fill="none" stroke={d.couleur} strokeWidth="22"
                  strokeDasharray={`${Math.max(0.5, long - ecart)} ${C}`} strokeDashoffset={-debut}
                  onMouseMove={ev => montrer(ev, d.libelle, `${d.valeur} · ${pct(d.valeur, total)} %`)} />
              );
            })}
          </g>
          <text x="90" y="88" textAnchor="middle" className="anneau-total">{total}</text>
          <text x="90" y="108" textAnchor="middle" className="axe">{libelleTotal}</text>
        </svg>
        {rendu}
      </div>
      <ul className="legende">
        {donnees.map(d => (
          <li key={d.libelle}>
            <span className="pastille" style={{ background: d.couleur }} />
            <span>{d.libelle}</span>
            <b>{d.valeur}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Barres horizontales avec libellés directs : [{ libelle, valeur }]
export function Barres({ donnees, total, onChoisir }) {
  const max = Math.max(1, ...donnees.map(d => d.valeur));
  return (
    <ul className="barres">
      {donnees.map(d => (
        <li key={d.libelle} title={`${d.libelle} : ${d.valeur} (${pct(d.valeur, total)} %)`}
          className={onChoisir ? "click" : ""} onClick={onChoisir && (() => onChoisir(d.libelle))}>
          <span className="barres-lib">{d.libelle}</span>
          <span className="barres-piste"><span style={{ width: `${(d.valeur / max) * 100}%` }} /></span>
          <b>{d.valeur}</b>
        </li>
      ))}
    </ul>
  );
}

// Regroupe les petites catégories dans « Autres »
export function regrouper(compte, n) {
  const tri = Object.entries(compte).sort((a, b) => b[1] - a[1]);
  const tete = tri.slice(0, n).map(([libelle, valeur]) => ({ libelle, valeur }));
  const reste = tri.slice(n).reduce((s, [, v]) => s + v, 0);
  return reste ? [...tete, { libelle: `Autres (${tri.length - n})`, valeur: reste }] : tete;
}
