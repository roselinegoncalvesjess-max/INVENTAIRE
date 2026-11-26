import { useEffect, useMemo, useState } from "react";
import { apiEquipements } from "../api.js";
import { aujourdhui, fmtDate, fmtMontant, manquants, STATUT_STYLE } from "../utils.js";
import Icone from "./Icone.jsx";
import { Statut } from "./Commun.jsx";
import FicheInventaire from "./FicheInventaire.jsx";
import Etiquettes from "./Etiquettes.jsx";
import { FormReattribution, PanneauDetenteurs } from "./Detenteurs.jsx";
import { FenetreClasser, PastilleType } from "./Beneficiaires.jsx";
import { Chronologie, construireChronologie, enRetard, FormMouvement, libelleSortie } from "./Mouvements.jsx";
import { apiClassement } from "../api.js";

// Page détail d'un équipement du registre
export default function FicheEquipement({ equipement: e, equipements, decharges, versionReleves, onRetour, onConstat, onReattribue, onOuvrirDecharge, peutModifier, agent, moi }) {
  const [releves, setReleves] = useState([]);
  const [constat, setConstat] = useState(false);
  const [copie, setCopie] = useState("");
  const [attributions, setAttributions] = useState([]);
  const [reattribuer, setReattribuer] = useState(false); // false, ou motif proposé ("" = au choix)
  const [mouvements, setMouvements] = useState([]);
  const [journal, setJournal] = useState([]);
  const [mouvement, setMouvement] = useState(false);
  const [classer, setClasser] = useState(false);
  const validerClassement = async () => {
    await apiClassement.classer([e.id], e.typeBeneficiaire, e.structureId);
    await onConstat("Classement validé");
  };

  useEffect(() => {
    apiEquipements.releves(e.id).then(setReleves).catch(() => setReleves([]));
    apiEquipements.attributions(e.id).then(setAttributions).catch(() => setAttributions([]));
    apiEquipements.mouvements(e.id).then(setMouvements).catch(() => setMouvements([]));
    apiEquipements.journal(e.id).then(setJournal).catch(() => setJournal([]));
  }, [e.id, versionReleves]);
  const evenements = useMemo(() => construireChronologie({ releves, attributions, mouvements, journal, decharges, equipementId: e.id }),
    [releves, attributions, mouvements, journal, decharges, e.id]);
  const sortie = e.sortieEnCours;

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

  const enregistrerAttribution = async (data, decharge) => {
    const saved = await apiEquipements.reattribuer(e.id, data);
    setReattribuer(false);
    await onReattribue(saved, data, decharge);
  };

  const enregistrerMouvement = async data => {
    const saved = await apiEquipements.enregistrerMouvement(e.id, data);
    setMouvement(false);
    await onConstat(`${saved.numeroFiche || saved.descriptif} : mouvement enregistré`);
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
          {peutModifier && <button className="btn primary" onClick={() => setMouvement(true)}><Icone nom="historique" taille={16} />Enregistrer un mouvement</button>}
          {peutModifier && e.statut !== "Réformé" && <button className="btn" onClick={() => setReattribuer("")}><Icone nom="utilisateur" taille={16} />Réattribuer</button>}
          {peutModifier && <button className="btn" onClick={() => setConstat(true)}><Icone nom="inventaire" taille={16} />Saisir un constat</button>}
        </div>
      </div>

      {e.anomalieImport && <p className="notice" style={{ margin: 0 }}><b>Anomalie à l’import :</b> {e.anomalieImport}</p>}
      {sortie && (
        <div className={"notice ligne-actions" + (enRetard(sortie) ? "" : " info")}>
          <span><b>{enRetard(sortie) ? "Retour en retard : " : "Sortie en cours : "}</b>{libelleSortie(sortie)}</span>
          {peutModifier && <button className="btn petit" onClick={() => setMouvement(true)}>Enregistrer le retour</button>}
        </div>
      )}
      {!e.classementValide && e.typeBeneficiaire && (
        <div className="notice info ligne-actions">
          <span><b>Classement proposé :</b> <PastilleType type={e.typeBeneficiaire} />{e.structureNom && <> {e.structureNom}</>}
            {e.classementRaison && <span className="muted"> — {e.classementRaison}</span>}</span>
          {peutModifier && <span className="toolbar">
            <button className="btn petit" onClick={() => setClasser(true)}>Corriger</button>
            <button className="btn petit primary" onClick={validerClassement}>Valider</button>
          </span>}
        </div>
      )}

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

          <PanneauDetenteurs equipement={e} attributions={attributions} peutModifier={peutModifier}
            onReattribuer={() => setReattribuer("")} />

          <Panneau icone="lieu" titre="Affectation">
            <dl className="infos">
              <Info l="Type de bénéficiaire"><PastilleType type={e.typeBeneficiaire} />{!e.classementValide && <span className="muted petit-texte"> (à valider)</span>}</Info>
              <Info l="Détenteur actuel"><Valeur v={e.utilisateur || "En stock"} /></Info>
              {e.region && <Info l="Région sanitaire"><Valeur v={e.region} /></Info>}
              {e.district && <Info l="District sanitaire"><Valeur v={e.district} /></Info>}
              {e.siteSanitaire && <Info l="Site sanitaire"><Valeur v={e.siteSanitaire} /></Info>}
              <Info l="Direction / service"><Valeur v={e.direction} /></Info>
              <Info l="Site"><Valeur v={e.site} /></Info>
              <Info l="Emplacement"><Valeur v={e.emplacement} /></Info>
            </dl>
            {peutModifier && <button className="btn petit lien-btn" onClick={() => setClasser(true)}>Modifier le type de bénéficiaire</button>}
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

          <Panneau icone="historique" titre={`Chronologie (${evenements.length})`}>
            <Chronologie evenements={evenements} moi={moi} onConstat={onConstat} onOuvrirDecharge={onOuvrirDecharge} />
            {peutModifier && <button className="btn plein" onClick={() => setMouvement(true)}>Enregistrer un mouvement</button>}
          </Panneau>
        </div>
      </div>

      {classer && (
        <FenetreClasser ids={[e.id]} titre={e.descriptif} typeInitial={e.typeBeneficiaire} structureInitiale={e.structureId}
          onFermer={() => setClasser(false)}
          onFait={async () => { setClasser(false); await onConstat("Classement enregistré"); }} />
      )}

      {mouvement && (
        <FormMouvement equipement={e} equipements={equipements} onEnregistrer={enregistrerMouvement}
          onReattribuer={motif => { setMouvement(false); setReattribuer(motif); }} onFermer={() => setMouvement(false)} />
      )}

      {reattribuer !== false && (
        <FormReattribution equipement={e} equipements={equipements} depuis={attributions.find(a => a.enCours)?.du} motifInitial={reattribuer}
          onEnregistrer={enregistrerAttribution} onFermer={() => setReattribuer(false)} />
      )}

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
