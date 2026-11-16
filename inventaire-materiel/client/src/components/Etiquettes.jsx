import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import Icone from "./Icone.jsx";

// Formats d'impression : taille de page CSS et mise en page
const FORMATS = {
  a4: { libelle: "A4 standard", page: "A4", etiquette: false },
  e50: { libelle: "Étiquette 50 × 30 mm", page: "50mm 30mm", etiquette: true },
  e62: { libelle: "Étiquette 62 × 29 mm", page: "62mm 29mm", etiquette: true }
};

const CLE_FORMAT = "inventaire.formatEtiquette";
const lireFormat = () => { try { return localStorage.getItem(CLE_FORMAT) || "a4"; } catch { return "a4"; } };

// Code imprimé : le n° de fiche, ou un identifiant provisoire tiré de l'id en base
export const codeEquipement = e => e.numeroFiche || `EQ-${String(e.id).padStart(5, "0")}`;

function codeBarresSvg(code) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, code, { format: "CODE128", displayValue: false, height: 70, width: 2, margin: 0, background: "#ffffff", lineColor: "#000000" });
  return svg.outerHTML;
}

const echapper = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Imprime via un cadre caché, sans ouvrir de nouvel onglet
function imprimer({ format, quoi, code, barres, qr, e }) {
  const f = FORMATS[format];
  const visuel = quoi === "qr" ? `<div class="qr">${qr}</div>` : `<div class="barres">${barres}</div>`;
  const corps = f.etiquette
    ? `<div class="etiquette ${quoi}">${visuel}<div class="txt"><b>${echapper(code)}</b><span>${echapper(e.descriptif)}</span></div></div>`
    : `<div class="a4"><h1>${echapper(e.descriptif)}</h1>
         <p>${echapper([e.categorie, e.site, e.emplacement].filter(Boolean).join(" · "))}</p>
         ${visuel}<p class="code">${echapper(code)}</p>
         <table>${[["N° de série", e.referenceSerie], ["Utilisateur", e.utilisateur], ["Direction", e.direction]]
           .filter(([, v]) => v).map(([l, v]) => `<tr><th>${l}</th><td>${echapper(v)}</td></tr>`).join("")}</table></div>`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(code)}</title><style>
    @page{size:${f.page};margin:${f.etiquette ? "2mm" : "15mm"}}
    *{box-sizing:border-box} body{margin:0;font-family:Arial,sans-serif;color:#000;background:#fff}
    svg{display:block;width:100%;height:100%}
    .a4{display:grid;gap:10px;justify-items:center;text-align:center;padding-top:20mm}
    .a4 h1{font-size:20pt;margin:0} .a4 p{margin:0;font-size:11pt}
    .a4 .barres{width:120mm;height:30mm} .a4 .qr{width:60mm;height:60mm}
    .a4 .code{font:600 14pt monospace;letter-spacing:.05em}
    .a4 table{margin-top:8mm;border-collapse:collapse;font-size:10pt} .a4 th{text-align:left;padding:2mm 6mm 2mm 0;color:#444} .a4 td{padding:2mm 0}
    .etiquette{width:100%;height:calc(${f.page.split(" ")[1]} - 4mm);display:flex;flex-direction:column;gap:1mm;overflow:hidden}
    .etiquette .barres{flex:1;min-height:0}
    .etiquette.qr{flex-direction:row;align-items:center;gap:2mm} .etiquette .qr{height:100%;aspect-ratio:1}
    .etiquette .txt{display:grid;font-size:6.5pt;line-height:1.15;min-width:0}
    .etiquette .txt b{font:700 7pt monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .etiquette .txt span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style></head><body>${corps}</body></html>`;

  const cadre = document.createElement("iframe");
  cadre.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(cadre);
  cadre.contentDocument.open(); cadre.contentDocument.write(html); cadre.contentDocument.close();
  setTimeout(() => {
    cadre.contentWindow.focus();
    cadre.contentWindow.print();
    setTimeout(() => cadre.remove(), 1000);
  }, 150);
}

// Bloc « Identification » de la fiche équipement : code-barres, QR code et impression
export default function Etiquettes({ equipement: e }) {
  const code = codeEquipement(e);
  const provisoire = !e.numeroFiche;
  const [format, setFormat] = useState(lireFormat);
  const [qr, setQr] = useState("");
  const zoneBarres = useRef(null);

  // Le QR code contient le code et les informations utiles pour une lecture hors application
  const texteQr = useMemo(() => [code, e.descriptif, e.referenceSerie && `S/N ${e.referenceSerie}`, e.site]
    .filter(Boolean).join("\n"), [code, e.descriptif, e.referenceSerie, e.site]);
  const barres = useMemo(() => { try { return codeBarresSvg(code); } catch { return ""; } }, [code]);

  useEffect(() => {
    let actif = true;
    QRCode.toString(texteQr, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then(s => actif && setQr(s)).catch(() => actif && setQr(""));
    return () => { actif = false; };
  }, [texteQr]);

  useEffect(() => { if (zoneBarres.current) zoneBarres.current.innerHTML = barres; }, [barres]);

  const choisir = v => { setFormat(v); try { localStorage.setItem(CLE_FORMAT, v); } catch { /* stockage indisponible */ } };
  const lancer = quoi => imprimer({ format, quoi, code, barres, qr, e });

  return (
    <section className="panneau">
      <h2 className="panneau-titre"><Icone nom="code" taille={16} />Identification</h2>
      <label className="field"><span className="label">Format d’impression</span>
        <select value={format} onChange={ev => choisir(ev.target.value)}>
          {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.libelle}</option>)}
        </select></label>

      <div className="code-bloc">
        <div className="code-tete"><span className="label">Code-barres</span>
          <button className="btn petit" onClick={() => lancer("barres")} disabled={!barres}><Icone nom="imprimer" taille={14} />Imprimer</button></div>
        <div className="code-visuel barres" ref={zoneBarres} role="img" aria-label={`Code-barres ${code}`} />
        <span className="code-valeur mono">{code}</span>
      </div>

      <div className="code-bloc">
        <div className="code-tete"><span className="label">QR code</span>
          <button className="btn petit" onClick={() => lancer("qr")} disabled={!qr}><Icone nom="imprimer" taille={14} />Imprimer</button></div>
        <div className="code-visuel qr" role="img" aria-label={`QR code ${code}`} dangerouslySetInnerHTML={{ __html: qr }} />
        <span className="code-valeur mono">{code}</span>
      </div>

      {provisoire && (
        <p className="hint">Pas de n° de fiche : le code imprimé est provisoire. Renseignez le n° de fiche via « Saisir un constat » pour obtenir le code définitif.</p>
      )}
    </section>
  );
}
