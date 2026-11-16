import { useEffect, useState } from "react";
import { apiEquipements } from "../api.js";
import { aujourdhui, fmtDate, fmtMontant, manquants, STATUT_STYLE } from "../utils.js";
import Icone from "./Icone.jsx";
import { Statut } from "./Commun.jsx";
import FicheInventaire from "./FicheInventaire.jsx";
import Etiquettes from "./Etiquettes.jsx";

const LIBELLES = {
  numeroFiche: "N° de fiche", identifiant: "Identifiant", type: "Type", categorie: "Catégorie", descriptif: "Descriptif",
  referenceSerie: "N° de série", accessoires: "Accessoires", valeurAcquisition: "Valeur d'acquisition",
  dateDebut: "Date d'acquisition", utilisateur: "Utilisateur", site: "Site", direction: "Direction", emplacement: "Emplacement",
  statut: "Statut", observation: "Observation"
};

// Page détail d'un équipement du registre
export default function FicheEquipement({ equipement: e, equipements, versionReleves, onRetour, onConstat, peutModifier, agent }) {
  const [releves, setReleves] = useState([]);
  const [constat, setConstat] = useState(false);
  const [copie, setCopie] = useState("");

  useEffect(() => {
    apiEquipements.releves(e.id).then(setReleves).catch(() => setReleves([]));
  }, [e.id, versionReleves]);

  const manque = manquants(e);
  const style = STATUT_STYLE[e.statut || "Non renseigné"];
  const amorti = e.dateFin && e.dateFin < aujourdhui();

  const copier = async v => {
    try { await navigator.clipboard.writeText(v); setCopie(v); setTimeout(() => setCopie(""), 1500); } catch { /* presse-papiers indisponible */ }
  };

  const enregistrer = async data => {
    const saved = await apiEquipements.inventorier(e.id, data);
    setConstat(false);
    await onConstat(`${saved.numeroFiche || saved.descriptif} : inventaire enregistré`);
  };

  const Valeur = ({ v, mono, copiable }) => (
    v === null || v === undefined || v === "" ? <span className="muted">—</span> : (
      <span className={mono ? "mono" : ""}>
        {v}
        {copiable && (
          <button className="btn-ico mini" onClick={() => copier(String(v))} title="Copier" aria-label={`Copier ${v}`}>
            <Icone nom={copie === String(v) ? "ok" : "copier"} taille={13} />
          </button>
        )}
      </span>
    )
  );

  return (
    <div className="pile">
      <section className="bandeau" style={{ "--teinte": style?.couleur }}>
        <div className="bandeau-gauche">
          <span className="bandeau-ico"><Icone nom={e.constat && e.constat !== "Présent" ? "absent" : "ok"} /></span>
          <div><b>{e.statut || "Statut non renseigné"}</b><br /><span className="muted">{[e.site, e.emplacement].filter(Boolean).join(" · ") || "Lieu non renseigné"}</span></div>
        </div>
        <div className="bandeau-chiffres">
          <div><b>{e.constat || "—"}</b><span>Inventaire</span></div>
          <div><b>{fmtMontant(e.valeurAcquisition)}</b><span>FCFA achat</span></div>
          <div><b className={manque.length ? "alerte" : ""}>{manque.length}</b><span>Infos manquantes</span></div>
        </div>
      </section>

      <div className="page-tete">
        <div className="page-titre">
          <button className="btn-ico grand" onClick={onRetour} aria-label="Retour à la liste"><Icone nom="retour" /></button>
          <span className="page-ico"><Icone nom="equipement" taille={22} /></span>
          <div>
            <h1>{e.descriptif} <Statut valeur={e.statut} /></h1>
            <p className="muted">
              {e.numeroFiche ? <Valeur v={e.numeroFiche} mono copiable /> : "Sans n° de fiche"} · {e.categorie || "Sans catégorie"}
            </p>
          </div>
        </div>
        <div className="toolbar">
          {peutModifier && <button className="btn primary" onClick={() => setConstat(true)}><Icone nom="inventaire" taille={16} />Saisir un constat</button>}
        </div>
      </div>

      {e.anomalieImport && <p className="notice" style={{ margin: 0 }}><b>Anomalie à l’import :</b> {e.anomalieImport}</p>}

      <div className="detail">
        <div className="pile">
          <Panneau icone="info" titre="Informations">
            <dl className="infos">
              <Info l="Type"><Valeur v={e.type} /></Info>
              <Info l="Catégorie"><Valeur v={e.categorie} /></Info>
              <Info l="N° de série / IMEI"><Valeur v={e.referenceSerie} mono copiable /></Info>
              <Info l="Identifiant (ID)"><Valeur v={e.identifiant} mono /></Info>
              <Info l="Accessoires"><Valeur v={e.accessoires} /></Info>
              <Info l="N° de compte"><Valeur v={e.numeroCompte} mono /></Info>
              <Info l="N° d’ordre (Excel)"><Valeur v={e.numOrdre} mono /></Info>
              <Info l="Ligne Excel"><Valeur v={e.ligneExcel} mono /></Info>
            </dl>
            <div className="notes"><span className="label">Observation</span><p>{e.observation || <i className="muted">Aucune observation.</i>}</p></div>
          </Panneau>

          <Panneau icone="utilisateur" titre="Affectation">
            <dl className="infos">
              <Info l="Utilisateur principal"><Valeur v={e.utilisateur} /></Info>
              <Info l="Direction / service"><Valeur v={e.direction} /></Info>
              <Info l="Site"><Valeur v={e.site} /></Info>
              <Info l="Emplacement"><Valeur v={e.emplacement} /></Info>
              {e.nouvelUtilisateur && <Info l="Nouvel utilisateur"><Valeur v={e.nouvelUtilisateur} /></Info>}
              {e.dateNouvelleAttribution && <Info l="Attribué le"><Valeur v={fmtDate(e.dateNouvelleAttribution)} mono /></Info>}
            </dl>
          </Panneau>

          <Panneau icone="finance" titre="Achat & finances">
            <div className="tuiles">
              <Tuile l="Prix d’achat" v={e.valeurAcquisition ? `${fmtMontant(e.valeurAcquisition)} FCFA` : "—"} />
              <Tuile l="Valeur nette au 31/12/2024" v={e.valeurNette !== null ? `${fmtMontant(e.valeurNette)} FCFA` : "—"} accent />
              <Tuile l="Amortissement" v={e.duree ? `${e.duree} ans · ${e.taux ?? "—"} %` : "—"} />
              <Tuile l="Date d’acquisition" v={fmtDate(e.dateDebut)} />
              <Tuile l="Fin d’amortissement" v={fmtDate(e.dateFin)} chip={e.dateFin && (amorti ? "Amorti" : "En cours")} />
              <Tuile l="Dotation 2024" v={e.dotation !== null ? `${fmtMontant(e.dotation)} FCFA` : "—"} />
            </div>
          </Panneau>
        </div>

        <div className="pile">
          <Etiquettes equipement={e} />
          <Panneau icone="inventaire" titre="Inventaire physique">
            {e.inventorieLe ? (
              <div className="constat">
                <span className={"chip " + (e.constat === "Présent" ? "ok" : "dup")}>{e.constat}</span>
                <p>Le <b>{fmtDate(e.inventorieLe)}</b> par <b>{e.inventoriePar}</b>{e.etatPhysique && <> · état : {e.etatPhysique}</>}</p>
              </div>
            ) : <p className="muted" style={{ margin: 0 }}>Pas encore inventorié.</p>}
            {peutModifier && <button className="btn primary plein" onClick={() => setConstat(true)}>Saisir un constat</button>}
          </Panneau>

          <Panneau icone="alerte" titre={`Informations manquantes (${manque.length})`}>
            {manque.length ? (
              <ul className="manques">{manque.map(m => <li key={m}>{m}</li>)}</ul>
            ) : <p className="muted" style={{ margin: 0 }}>La fiche est complète.</p>}
          </Panneau>

          <Panneau icone="historique" titre="Historique">
            {releves.length ? (
              <ol className="frise">
                {releves.map(h => (
                  <li key={h.id}>
                    <span className="mono muted">{fmtDate(h.date)}</span>
                    <span><b>{h.constat}</b>{h.etatPhysique && ` · ${h.etatPhysique}`} — {h.agent}</span>
                    {h.commentaire && <i className="muted">{h.commentaire}</i>}
                    {Object.keys(h.modifications || {}).length > 0 && (
                      <span className="muted petit-texte">
                        {Object.entries(h.modifications).map(([k, m]) => `${LIBELLES[k] || k} : ${m.avant ?? "vide"} → ${m.apres ?? "vide"}`).join(" ; ")}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : <p className="muted" style={{ margin: 0 }}>Aucun mouvement enregistré.</p>}
          </Panneau>
        </div>
      </div>

      {constat && (
        <FicheInventaire equipement={e} equipements={equipements} aSuivant={false} agent={agent}
          onEnregistrer={enregistrer} onFermer={() => setConstat(false)} />
      )}
    </div>
  );
}

function Panneau({ icone, titre, children }) {
  return (
    <section className="panneau">
      <h2 className="panneau-titre"><Icone nom={icone} taille={16} />{titre}</h2>
      {children}
    </section>
  );
}

const Info = ({ l, children }) => <div><dt className="label">{l}</dt><dd>{children}</dd></div>;

const Tuile = ({ l, v, accent, chip }) => (
  <div className="tuile">
    <span className="label">{l}</span>
    <b className={accent ? "positif" : ""}>{v}</b>
    {chip && <span className={"chip " + (chip === "Amorti" ? "" : "ok")}>{chip}</span>}
  </div>
);
