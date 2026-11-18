import { useEffect, useMemo, useState } from "react";
import { apiClassement, apiStructures } from "../api.js";
import { compter, norm, NIVEAUX, TYPES_BENEFICIAIRE } from "../utils.js";
import Icone from "./Icone.jsx";
import { PageTete, Pagination } from "./Commun.jsx";
import { FenetreClasser, libelleStructure, NouvelleStructure, PastilleType, useStructures } from "./Beneficiaires.jsx";

const PAR_PAGE = 30;
const ONGLETS = [["valider", "Propositions à valider"], ["doublons", "Noms en double"], ["structures", "Structures sanitaires"]];

// Page « À classer » : valider le type de bénéficiaire, regrouper les noms, gérer le référentiel
export default function Classement({ equipements, onChange, onOuvrirEquipement, onToast, estAdmin }) {
  const [onglet, setOnglet] = useState("valider");
  const aValider = equipements.filter(e => !e.classementValide);
  return (
    <div className="pile">
      <PageTete icone="utilisateur" titre="À classer"
        sous="Distinguer le personnel et les services de la NPSP, les sites, districts et régions sanitaires" />
      <div className="onglets" role="tablist">
        {ONGLETS.map(([k, t]) => (
          <button key={k} role="tab" aria-selected={onglet === k} className={"onglet" + (onglet === k ? " on" : "")} onClick={() => setOnglet(k)}>
            {t}{k === "valider" && <span className="nav-badge">{aValider.length}</span>}
          </button>
        ))}
      </div>
      {onglet === "valider" && <Propositions equipements={equipements} aValider={aValider} onChange={onChange} onOuvrirEquipement={onOuvrirEquipement} onToast={onToast} />}
      {onglet === "doublons" && <Doublons onChange={onChange} onToast={onToast} />}
      {onglet === "structures" && <Structures onToast={onToast} estAdmin={estAdmin} onChange={onChange} />}
    </div>
  );
}

function Propositions({ equipements, aValider, onChange, onOuvrirEquipement, onToast }) {
  const [type, setType] = useState("");
  const [recherche, setRecherche] = useState("");
  const [choix, setChoix] = useState(new Set());
  const [fenetre, setFenetre] = useState(false);
  const [page, setPage] = useState(1);
  const [envoi, setEnvoi] = useState(false);

  const parType = compter(aValider, "typeBeneficiaire");
  const valides = equipements.length - aValider.length;
  const q = norm(recherche);
  const lignes = aValider.filter(e => (!type || e.typeBeneficiaire === type) &&
    (!q || norm([e.descriptif, e.numeroFiche, e.utilisateur, e.site, e.direction, e.classementRaison].join(" ")).includes(q)));
  useEffect(() => { setPage(1); setChoix(new Set()); }, [type, recherche]);
  const visibles = lignes.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);
  const nbPages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const selection = lignes.filter(e => choix.has(e.id));
  const tousCoches = lignes.length > 0 && lignes.every(e => choix.has(e.id));

  const basculer = id => setChoix(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toutBasculer = () => setChoix(tousCoches ? new Set() : new Set(lignes.map(e => e.id)));

  // Accepte la proposition de chaque équipement sélectionné (regroupés par type + structure)
  const accepter = async () => {
    setEnvoi(true);
    try {
      const lots = {};
      for (const e of selection) (lots[`${e.typeBeneficiaire}|${e.structureId ?? ""}`] ||= []).push(e);
      let n = 0;
      for (const lot of Object.values(lots)) n += (await apiClassement.classer(lot.map(e => e.id), lot[0].typeBeneficiaire, lot[0].structureId)).modifies;
      onToast(`${n} classement(s) validé(s)`);
      setChoix(new Set());
      await onChange();
    } catch (ex) { onToast("Validation impossible : " + ex.message); }
    setEnvoi(false);
  };

  return (
    <>
      <section className="kpis">
        <Carte titre="À valider" valeur={aValider.length} sous={`${valides} déjà validé(s) sur ${equipements.length}`} teinte="orange"
          actif={!type} onClick={() => setType("")} />
        {Object.entries(TYPES_BENEFICIAIRE).map(([k, t]) => (
          <Carte key={k} titre={t.libelle} valeur={parType[k] || 0} sous="proposés" couleur={t.couleur}
            actif={type === k} onClick={() => setType(type === k ? "" : k)} />
        ))}
      </section>

      <p className="notice info" style={{ margin: 0 }}>
        L’application a proposé un type pour chaque équipement à partir de l’utilisateur, du site et de la direction du registre.
        Cochez les propositions justes puis <b>Valider la proposition</b>, ou <b>Classer autrement</b> pour corriger.
      </p>

      <section className="filtres">
        <label className="field grand"><span className="label">Recherche</span>
          <input type="search" value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Utilisateur, site, direction, raison…" /></label>
        <label className="field"><span className="label">Type proposé</span>
          <select value={type} onChange={e => setType(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(TYPES_BENEFICIAIRE).map(([k, t]) => <option key={k} value={k}>{t.libelle}</option>)}
          </select></label>
      </section>

      <section className="panneau sans-marge">
        <div className="tableau-tete">
          <span className="muted">{selection.length ? <b>{selection.length} sélectionné(s)</b> : `${lignes.length} proposition(s)`}</span>
          <div className="toolbar">
            <button className="btn" disabled={!selection.length} onClick={() => setFenetre(true)}>Classer autrement…</button>
            <button className="btn primary" disabled={!selection.length || envoi} onClick={accepter}>
              <Icone nom="ok" taille={16} />{envoi ? "Validation…" : "Valider la proposition"}
            </button>
          </div>
        </div>
        {!lignes.length ? (
          <div className="empty"><p className="muted" style={{ margin: 0 }}>
            {aValider.length ? "Aucune proposition ne correspond à ces filtres." : "Tout est classé. Les nouveaux équipements et les changements constatés à l’inventaire apparaîtront ici."}
          </p></div>
        ) : (
          <div className="tablebox nu">
            <table>
              <thead><tr>
                <th><input type="checkbox" checked={tousCoches} onChange={toutBasculer} aria-label="Tout sélectionner" /></th>
                <th>Équipement</th><th>Utilisateur dans le registre</th><th>Site · direction</th><th>Proposition</th><th>Pourquoi</th>
              </tr></thead>
              <tbody>
                {visibles.map(e => (
                  <tr key={e.id} className={choix.has(e.id) ? "choisi" : ""}>
                    <td><input type="checkbox" checked={choix.has(e.id)} onChange={() => basculer(e.id)} aria-label={`Sélectionner ${e.descriptif}`} /></td>
                    <td><button className="lien" onClick={() => onOuvrirEquipement(e.id)}>{e.descriptif}</button><br /><span className="muted mono">{e.numeroFiche || "—"}</span></td>
                    <td>{e.utilisateur || <span className="muted">—</span>}</td>
                    <td>{e.site || "—"}<br /><span className="muted petit-texte">{e.direction || ""}</span></td>
                    <td><PastilleType type={e.typeBeneficiaire} />{e.structureNom && <><br /><span className="petit-texte">{e.structureNom}</span></>}</td>
                    <td className="muted petit-texte">{e.classementRaison || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} nbPages={nbPages} setPage={setPage} />
      </section>

      {fenetre && (
        <FenetreClasser ids={selection.map(e => e.id)} titre={`${selection.length} équipement(s) sélectionné(s)`}
          typeInitial={new Set(selection.map(e => e.typeBeneficiaire)).size === 1 ? selection[0].typeBeneficiaire : ""}
          onFermer={() => setFenetre(false)}
          onFait={async n => { setFenetre(false); setChoix(new Set()); onToast(`${n} équipement(s) classé(s)`); await onChange(); }} />
      )}
    </>
  );
}

function Carte({ titre, valeur, sous, teinte = "", couleur, actif, onClick }) {
  return (
    <button className={"kpi petit click " + teinte + (actif ? " actif" : "")} style={couleur ? { "--t": couleur } : undefined}
      onClick={onClick} aria-pressed={actif}>
      <span className="label">{titre}</span>
      <b className="kpi-valeur">{valeur}</b>
      <span className="muted kpi-sous">{sous}</span>
    </button>
  );
}

// ---------- Noms écrits de plusieurs façons ----------

const CLE_IGNORES = "parcit.doublons-ignores";
const lireIgnores = () => { try { return new Set(JSON.parse(localStorage.getItem(CLE_IGNORES) || "[]")); } catch { return new Set(); } };

function Doublons({ onChange, onToast }) {
  const [groupes, setGroupes] = useState(null);
  const [ignores, setIgnores] = useState(lireIgnores);
  const charger = () => apiClassement.doublons().then(setGroupes).catch(() => setGroupes([]));
  useEffect(() => { charger(); }, []);

  const cle = g => g.map(n => n.nom).sort().join("|");
  const ignorer = g => {
    const n = new Set(ignores); n.add(cle(g)); setIgnores(n);
    try { localStorage.setItem(CLE_IGNORES, JSON.stringify([...n])); } catch { /* stockage indisponible */ }
  };
  const visibles = (groupes || []).filter(g => !ignores.has(cle(g)));

  if (groupes === null) return <p className="muted">Recherche des noms en double…</p>;
  return (
    <>
      <p className="notice info" style={{ margin: 0 }}>
        Ces noms semblent désigner la même personne (même nom avec une orthographe ou des prénoms différents).
        Choisissez l’écriture à conserver : tous les équipements et l’historique des détenteurs passeront sous ce nom.
        Les groupes ignorés ne sont masqués que sur ce poste.
      </p>
      {!visibles.length ? <div className="panneau"><p className="muted" style={{ margin: 0 }}>Aucun nom en double à traiter.</p></div> : (
        <div className="grille-doublons">
          {visibles.map(g => <GroupeNoms key={cle(g)} groupe={g} onIgnorer={() => ignorer(g)}
            onFait={async (nom, n) => { onToast(`${n} équipement(s) regroupé(s) sous « ${nom} »`); await charger(); await onChange(); }} />)}
        </div>
      )}
    </>
  );
}

function GroupeNoms({ groupe, onFait, onIgnorer }) {
  const [nom, setNom] = useState(groupe[0].nom.replace(/\s+/g, " ").trim());
  const [erreur, setErreur] = useState("");
  const total = groupe.reduce((s, n) => s + n.nb, 0);
  const regrouper = async () => {
    try {
      const r = await apiClassement.fusionner(groupe.map(n => n.nom), nom);
      await onFait(nom, r.modifies);
    } catch (ex) { setErreur(ex.message); }
  };
  return (
    <section className="panneau">
      <h2 className="panneau-titre"><Icone nom="utilisateur" taille={16} />{groupe.length} écritures · {total} équipement(s)</h2>
      <ul className="choix-noms">
        {groupe.map(n => (
          <li key={n.nom}>
            <label className="case">
              <input type="radio" name={"g" + groupe[0].nom} checked={nom === n.nom.replace(/\s+/g, " ").trim()}
                onChange={() => setNom(n.nom.replace(/\s+/g, " ").trim())} />
              <span>{n.nom}</span><span className="muted">· {n.nb}</span>
            </label>
          </li>
        ))}
      </ul>
      <label className="field"><span className="label">Nom conservé (modifiable)</span>
        <input value={nom} onChange={ev => setNom(ev.target.value)} /></label>
      {erreur && <p className="hint">{erreur}</p>}
      <div className="toolbar">
        <button className="btn petit" onClick={onIgnorer}>Personnes différentes</button>
        <button className="btn petit primary" disabled={!nom.trim()} onClick={regrouper}>Regrouper sous ce nom</button>
      </div>
    </section>
  );
}

// ---------- Référentiel : régions → districts → sites ----------

function Structures({ onToast, estAdmin, onChange }) {
  const [structures, recharger] = useStructures();
  const [ajout, setAjout] = useState(null);       // { niveau, parentId }
  const [edition, setEdition] = useState(null);   // structure en cours de modification
  const parId = useMemo(() => Object.fromEntries(structures.map(s => [s.id, s])), [structures]);
  const enfants = p => structures.filter(s => s.parentId === p).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const regions = structures.filter(s => s.niveau === "region").sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const districtsSansRegion = structures.filter(s => s.niveau === "district" && !s.parentId).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const sitesSansDistrict = structures.filter(s => s.niveau === "site" && !s.parentId);
  const apres = async msg => { onToast(msg); await recharger(); await onChange(); };

  const supprimer = async s => {
    if (!window.confirm(`Supprimer « ${s.nom} » du référentiel ?`)) return;
    try { await apiStructures.supprimer(s.id); await apres(`« ${s.nom} » supprimé`); } catch (ex) { onToast(ex.message); }
  };

  const Ligne = ({ s }) => (
    <div className="structure-ligne">
      <span className={"niveau " + s.niveau}>{NIVEAUX[s.niveau].split(" ")[0]}</span>
      <b>{s.nom}</b>
      {s.responsable && <span className="muted petit-texte">· {s.responsable}{s.telephone && ` (${s.telephone})`}</span>}
      <span className="muted petit-texte">{s.nbEquipements ? `${s.nbEquipements} équipement(s)` : ""}</span>
      <span className="toolbar">
        {s.niveau !== "site" && <button className="btn petit" onClick={() => setAjout({ niveau: s.niveau === "region" ? "district" : "site", parentId: s.id })}>+ {s.niveau === "region" ? "District" : "Site"}</button>}
        <button className="btn petit" onClick={() => setEdition(s)}>Modifier</button>
        {estAdmin && !s.nbEquipements && <button className="btn petit" onClick={() => supprimer(s)} aria-label={`Supprimer ${s.nom}`}>Supprimer</button>}
      </span>
    </div>
  );

  const Arbre = ({ s }) => (
    <li><Ligne s={s} />{enfants(s.id).length > 0 && <ul>{enfants(s.id).map(c => <Arbre key={c.id} s={c} />)}</ul>}</li>
  );

  return (
    <>
      <section className="panneau">
        <div className="panneau-tete ligne">
          <div><h2>Pyramide sanitaire</h2>
            <p className="muted">{regions.length} région(s) · {structures.filter(s => s.niveau === "district").length} district(s) · {structures.filter(s => s.niveau === "site").length} site(s). Créés à partir du registre : complétez les régions et rattachez-y les districts.</p></div>
          <div className="toolbar">
            <button className="btn" onClick={() => setAjout({ niveau: "region" })}>+ Région</button>
            <button className="btn" onClick={() => setAjout({ niveau: "district" })}>+ District</button>
            <button className="btn" onClick={() => setAjout({ niveau: "site" })}>+ Site</button>
          </div>
        </div>
        {ajout && (
          <NouvelleStructure key={JSON.stringify(ajout)} niveau={ajout.niveau} parentInitial={ajout.parentId} structures={structures}
            onAnnuler={() => setAjout(null)} onCree={async () => { setAjout(null); await apres("Structure ajoutée"); }} />
        )}
        <ul className="arbre">
          {regions.map(s => <Arbre key={s.id} s={s} />)}
          {districtsSansRegion.length > 0 && (
            <li><span className="label">Districts sans région</span>
              <ul>{districtsSansRegion.map(s => <Arbre key={s.id} s={s} />)}</ul></li>
          )}
          {sitesSansDistrict.length > 0 && (
            <li><span className="label">Sites sans district</span>
              <ul>{sitesSansDistrict.map(s => <li key={s.id}><Ligne s={s} /></li>)}</ul></li>
          )}
        </ul>
        {!structures.length && <p className="muted">Aucune structure pour l’instant.</p>}
      </section>
      {edition && <ModifierStructure s={edition} structures={structures} parId={parId} onFermer={() => setEdition(null)}
        onFait={async () => { setEdition(null); await apres("Structure modifiée"); }} />}
    </>
  );
}

function ModifierStructure({ s, structures, parId, onFermer, onFait }) {
  const [f, setF] = useState({ nom: s.nom, parentId: s.parentId || "", responsable: s.responsable || "", telephone: s.telephone || "" });
  const [erreur, setErreur] = useState("");
  const niveauParent = { site: "district", district: "region" }[s.niveau];
  const parents = structures.filter(x => x.niveau === niveauParent)
    .map(x => ({ ...x, libelle: libelleStructure(x, parId) })).sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
  const maj = k => ev => setF(v => ({ ...v, [k]: ev.target.value }));
  const enregistrer = async ev => {
    ev.preventDefault();
    try { await apiStructures.modifier(s.id, { ...f, parentId: f.parentId || null }); await onFait(); } catch (ex) { setErreur(ex.message); }
  };
  return (
    <div className="overlay" onClick={ev => ev.target === ev.currentTarget && onFermer()}>
      <form className="card petite" role="dialog" aria-modal="true" aria-labelledby="msTitre" onSubmit={enregistrer}>
        <h2 id="msTitre">{NIVEAUX[s.niveau]}</h2>
        <label className="field"><span className="label">Nom</span><input value={f.nom} onChange={maj("nom")} /></label>
        {niveauParent && (
          <label className="field"><span className="label">{NIVEAUX[niveauParent]} de rattachement</span>
            <select value={f.parentId} onChange={maj("parentId")}>
              <option value="">— À préciser —</option>
              {parents.map(p => <option key={p.id} value={p.id}>{p.libelle}</option>)}
            </select></label>
        )}
        <label className="field"><span className="label">Responsable du matériel (ex. pharmacien)</span><input value={f.responsable} onChange={maj("responsable")} /></label>
        <label className="field"><span className="label">Téléphone</span><input value={f.telephone} onChange={maj("telephone")} inputMode="tel" /></label>
        {erreur && <p className="notice" style={{ margin: 0 }}>{erreur}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={onFermer}>Annuler</button>
          <button type="submit" className="btn primary">Enregistrer</button>
        </div>
      </form>
    </div>
  );
}
