import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiAuth, apiEquipements, quandDeconnecte, ROLES } from "./api.js";
import { aplatir, norm } from "./utils.js";
import { codeEquipement } from "./components/Etiquettes.jsx";
import Icone from "./components/Icone.jsx";
import TableauDeBord from "./components/TableauDeBord.jsx";
import Equipements from "./components/Equipements.jsx";
import FicheEquipement from "./components/FicheEquipement.jsx";
import InventairePhysique from "./components/InventairePhysique.jsx";
import Historique from "./components/Historique.jsx";
import ListeDecharges from "./components/ListeDecharges.jsx";
import Inventaire from "./components/Inventaire.jsx";
import FormulaireDecharge from "./components/FormulaireDecharge.jsx";
import FicheDecharge from "./components/FicheDecharge.jsx";
import Connexion, { ChangerMotDePasse } from "./components/Connexion.jsx";
import Utilisateurs from "./components/Utilisateurs.jsx";

// Menu latéral : sections et pages
const MENU = [
  { pages: [["tableau", "Tableau de bord", "tableau"]] },
  { titre: "Parc & inventaire", pages: [
    ["equipements", "Équipements", "equipement"],
    ["inventaire", "Inventaire physique", "inventaire"],
    ["historique", "Historique", "historique"]
  ] },
  { titre: "Remises de matériel", pages: [
    ["decharges", "Décharges", "decharge"],
    ["remis", "Matériel remis", "remis"]
  ] }
];
const ADMIN = { titre: "Administration", pages: [["utilisateurs", "Utilisateurs", "utilisateur"]] };
const TITRES = Object.fromEntries([...MENU, ADMIN].flatMap(s => s.pages.map(([k, t]) => [k, t])));
TITRES.saisie = "Décharge";

// Point d'entrée : vérifie la session, affiche la connexion ou l'application
export default function App() {
  const [utilisateur, setUtilisateur] = useState(undefined); // undefined = vérification en cours, null = déconnecté

  useEffect(() => {
    quandDeconnecte(() => setUtilisateur(null));
    let t;
    const verifier = () => apiAuth.moi().then(setUtilisateur).catch(e => {
      if (e.status === 401) setUtilisateur(null);
      else t = setTimeout(verifier, 5000); // serveur injoignable : nouvel essai
    });
    verifier();
    return () => clearTimeout(t);
  }, []);

  if (utilisateur === undefined) return <div className="ecran-acces"><p className="muted">Connexion au serveur…</p></div>;
  if (!utilisateur || utilisateur.doitChanger) return <Connexion utilisateur={utilisateur} onConnecte={setUtilisateur} />;
  return <Application utilisateur={utilisateur} setUtilisateur={setUtilisateur} />;
}

function Application({ utilisateur, setUtilisateur }) {
  const peutModifier = utilisateur.role !== "lecteur";
  const estAdmin = utilisateur.role === "admin";
  const [motDePasse, setMotDePasse] = useState(false);
  const [decharges, setDecharges] = useState([]);
  const [equipements, setEquipements] = useState([]);
  const [etat, setEtat] = useState("chargement");     // chargement | ok | erreur
  const [page, setPage] = useState("tableau");
  const [detailId, setDetailId] = useState(null);     // fiche équipement ouverte
  const [recherche, setRecherche] = useState("");     // recherche globale → page Équipements
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState(null);
  const [ficheId, setFicheId] = useState(null);
  const [toast, setToast] = useState("");
  const [versionReleves, setVersionReleves] = useState(0); // recharge l'historique après un constat

  const charger = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([api.lister(), apiEquipements.lister()]);
      setDecharges(d);
      setEquipements(e);
      setEtat("ok");
    } catch (e) {
      if (e.status !== 401) setEtat("erreur");
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Serveur injoignable (redémarrage, PostgreSQL arrêté…) : nouvel essai toutes les 5 secondes
  useEffect(() => {
    if (etat !== "erreur") return;
    const t = setInterval(charger, 5000);
    return () => clearInterval(t);
  }, [etat, charger]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const items = useMemo(() => aplatir(decharges), [decharges]);
  const structures = useMemo(
    () => [...new Set(decharges.map(d => d.structure).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [decharges]
  );

  const aller = p => { setPage(p); setDetailId(null); setMenuOuvert(false); window.scrollTo(0, 0); };
  const ouvrirEquipement = id => { setDetailId(id); setPage("equipements"); window.scrollTo(0, 0); };
  const apresConstat = async message => { setToast(message); setVersionReleves(v => v + 1); await charger(); };

  const ouvrirFormulaire = d => { setEnEdition(d || null); setFicheId(null); aller("saisie"); };
  const enregistrerDecharge = async data => {
    const saved = enEdition ? await api.modifier(enEdition.id, data) : await api.creer(data);
    setToast(enEdition ? "Décharge modifiée" : `Décharge ${saved.numero} enregistrée`);
    setEnEdition(null);
    await charger();
    aller("decharges");
  };
  const supprimerDecharge = async id => {
    await api.supprimer(id);
    setFicheId(null);
    setToast("Décharge supprimée");
    await charger();
  };

  // Un code scanné (n° de fiche, code provisoire ou n° de série unique) ouvre directement la fiche
  const rechercher = ev => {
    ev.preventDefault();
    const q = norm(recherche.trim());
    const exacts = q ? equipements.filter(e => norm(codeEquipement(e)) === q || norm(e.referenceSerie) === q) : [];
    if (exacts.length === 1) { setRecherche(""); setMenuOuvert(false); ouvrirEquipement(exacts[0].id); }
    else aller("equipements");
  };

  const deconnecter = async () => { try { await apiAuth.deconnexion(); } finally { setUtilisateur(null); } };

  const detail = detailId && equipements.find(e => e.id === detailId);
  const fiche = decharges.find(d => d.id === ficheId);
  const aujourdhui = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <div className={"app" + (menuOuvert ? " menu-ouvert" : "")}>
      <aside className="sidebar" aria-label="Menu principal">
        <div className="logo">
          <span className="logo-mark"><Icone nom="inventaire" taille={20} /></span>
          <span><b>Parc IT</b><small>LHSPLA</small></span>
          <button className="btn ghost only-mobile" onClick={() => setMenuOuvert(false)} aria-label="Fermer le menu"><Icone nom="fermer" /></button>
        </div>
        <nav>
          {[...MENU, ...(estAdmin ? [ADMIN] : [])].map((s, i) => (
            <div className="nav-section" key={i}>
              {s.titre && <span className="nav-titre">{s.titre}</span>}
              {s.pages.map(([k, t, ic]) => (
                <button key={k} className="nav-lien" aria-current={page === k || (k === "decharges" && page === "saisie") ? "page" : undefined}
                  onClick={() => aller(k)}>
                  <Icone nom={ic} />{t}
                  {k === "inventaire" && equipements.length > 0 && (
                    <span className="nav-badge">{equipements.filter(e => !e.inventorieLe).length}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-pied">
          <div className="compte">
            <span className="avatar" aria-hidden="true">{utilisateur.nom.split(/\s+/).map(m => m[0]).slice(0, 2).join("").toUpperCase()}</span>
            <span><b>{utilisateur.nom}</b><small>{ROLES[utilisateur.role]}</small></span>
          </div>
          <div className="toolbar">
            <button className="btn petit" onClick={() => setMotDePasse(true)}>Mot de passe</button>
            <button className="btn petit" onClick={deconnecter}>Se déconnecter</button>
          </div>
          <span className="etat-serveur">
            <span className={"dot " + (etat === "ok" ? "on" : etat === "erreur" ? "off" : "")} />
            {etat === "ok" ? "Connecté au serveur" : etat === "erreur" ? "Serveur injoignable" : "Connexion…"}
          </span>
        </div>
      </aside>
      <div className="voile" onClick={() => setMenuOuvert(false)} />

      <div className="principal">
        <header className="topbar">
          <button className="btn ghost only-mobile" onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu"><Icone nom="menu" /></button>
          <span className="topbar-titre">{TITRES[page]}</span>
          <form className="recherche-globale" onSubmit={rechercher} role="search">
            <Icone nom="recherche" taille={16} />
            <input type="search" value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher ou scanner un code-barres…" aria-label="Recherche globale ou code-barres scanné" />
          </form>
          <span className="topbar-date">{aujourdhui}</span>
        </header>

        <main className="contenu">
          {etat === "erreur" && (
            <div className="notice">
              Serveur injoignable, nouvel essai automatique toutes les 5 secondes. S’il persiste, vérifiez que le serveur Node.js est lancé (<code>npm.cmd run dev</code> dans le dossier server) et que PostgreSQL est démarré.
            </div>
          )}

          {page === "tableau" && (
            <TableauDeBord equipements={equipements} decharges={decharges} dateDuJour={aujourdhui}
              onAller={aller} onOuvrirEquipement={ouvrirEquipement} />
          )}
          {page === "equipements" && (detail ? (
            <FicheEquipement equipement={detail} equipements={equipements} versionReleves={versionReleves}
              onRetour={() => setDetailId(null)} onConstat={apresConstat} peutModifier={peutModifier} agent={utilisateur.nom} />
          ) : (
            <Equipements equipements={equipements} recherche={recherche} setRecherche={setRecherche}
              onOuvrir={ouvrirEquipement} />
          ))}
          {page === "inventaire" && (
            <InventairePhysique equipements={equipements} etat={etat} onEnregistre={apresConstat}
              peutModifier={peutModifier} agent={utilisateur.nom} onOuvrirEquipement={ouvrirEquipement} />
          )}
          {page === "historique" && (
            <Historique version={versionReleves} decharges={decharges} onOuvrirEquipement={ouvrirEquipement}
              onOuvrirDecharge={setFicheId} />
          )}
          {page === "decharges" && (
            <ListeDecharges decharges={decharges} structures={structures}
              onOuvrir={setFicheId} onNouvelle={peutModifier ? () => ouvrirFormulaire(null) : null} />
          )}
          {page === "remis" && (
            <Inventaire items={items} structures={structures}
              onOuvrir={setFicheId} onNouvelle={peutModifier ? () => ouvrirFormulaire(null) : null} />
          )}
          {page === "utilisateurs" && estAdmin && <Utilisateurs moi={utilisateur} onToast={setToast} />}
          {page === "saisie" && peutModifier && (
            <FormulaireDecharge
              key={enEdition?.id ?? "nouvelle"}
              decharge={enEdition}
              decharges={decharges}
              structures={structures}
              onEnregistrer={enregistrerDecharge}
              onAnnuler={() => { setEnEdition(null); aller("decharges"); }}
            />
          )}
        </main>
      </div>

      {fiche && (
        <FicheDecharge decharge={fiche}
          onFermer={() => setFicheId(null)}
          onModifier={peutModifier ? () => ouvrirFormulaire(fiche) : null}
          onSupprimer={peutModifier ? () => supprimerDecharge(fiche.id) : null} />
      )}

      {motDePasse && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setMotDePasse(false)}>
          <div className="card petite" role="dialog" aria-modal="true" aria-labelledby="mdpTitre">
            <h2 id="mdpTitre">Changer mon mot de passe</h2>
            <ChangerMotDePasse onAnnuler={() => setMotDePasse(false)}
              onFait={u => { setMotDePasse(false); setUtilisateur(u); setToast("Mot de passe modifié"); }} />
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
