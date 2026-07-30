import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCadrage } from '../CadrageContext';
import { POINTS } from '../../shared/points';
import type { LigneCadrage, ReponseCadrages } from '../../shared/api';
import * as api from '../lib/api';
import { ErreurApi } from '../lib/api';
import { enregistrerJetonAdmin, jetonAdmin } from '../lib/lien';
import { depuis, joursDepuis, minutes } from '../lib/dates';

/** Sans signe de vie depuis, un cadrage passe en pause puis en sommeil. */
const JOURS_PAUSE = 2;
const JOURS_DORMANT = 7;

type Onglet = 'tous' | 'en_cours' | 'a_chiffrer' | 'dormants';
type Etat = 'jeton' | 'chargement' | 'pret' | 'erreur';

interface Badge {
  texte: string;
  classe: string;
}

/** Le statut tel que le prestataire veut le lire : l'urgence d'abord. */
function badge(ligne: LigneCadrage): Badge {
  if (ligne.statut === 'valide') {
    return { texte: 'VALIDÉ · À CHIFFRER', classe: 'dash__badge dash__badge--done' };
  }

  const jours = joursDepuis(ligne.majLe);
  if (jours >= JOURS_DORMANT) {
    return { texte: `DORMANT · ${jours} J`, classe: 'dash__badge dash__badge--cold' };
  }
  if (ligne.tensionOuverte) {
    return { texte: 'EN COURS · 1 TENSION', classe: 'dash__badge dash__badge--live' };
  }
  if (jours >= JOURS_PAUSE) {
    return { texte: `EN PAUSE · ${jours} J`, classe: 'dash__badge' };
  }
  return { texte: 'EN COURS', classe: 'dash__badge dash__badge--live' };
}

function voieLisible(ligne: LigneCadrage): string {
  const base = ligne.voie === 'rapide' ? 'rapide' : 'entretien';
  if (ligne.statut === 'valide') return `${base} · ${minutes(ligne.dureeMs)} min`;
  return ligne.mode === 'court' ? `${base} · version courte` : base;
}

function Pips({ ligne }: { ligne: LigneCadrage }) {
  return (
    <span className="dash__pips">
      {POINTS.map((point, k) => (
        <span
          key={point.num}
          className={
            ligne.pointsCouverts.includes(k)
              ? 'dash__pip dash__pip--done'
              : ligne.enCours === k
                ? 'dash__pip dash__pip--current'
                : 'dash__pip'
          }
        />
      ))}
    </span>
  );
}

const COLUMNS = ['CLIENT', 'DEMANDE', 'COUVERTURE', 'VOIE', 'STATUT', 'DERNIER SIGNAL'];

/** L'autre côté du produit : ce que Nicolas voit de ses cadrages en cours. */
export function Dashboard() {
  const { onToggleTheme } = useCadrage();

  const [jeton, setJeton] = useState<string | null>(() => jetonAdmin());
  const [etat, setEtat] = useState<Etat>(jeton ? 'chargement' : 'jeton');
  const [donnees, setDonnees] = useState<ReponseCadrages | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('tous');
  const [filtre, setFiltre] = useState('');
  const [copie, setCopie] = useState<string | null>(null);

  const charger = useCallback(async (valeur: string): Promise<void> => {
    setEtat('chargement');
    try {
      setDonnees(await api.listerCadrages(valeur));
      setEtat('pret');
      setMessage(null);
    } catch (cause) {
      if (cause instanceof ErreurApi && cause.statut === 401) {
        enregistrerJetonAdmin(null);
        setJeton(null);
        setEtat('jeton');
        setMessage("Ce jeton n'est pas accepté.");
        return;
      }
      setEtat('erreur');
      setMessage(cause instanceof Error ? cause.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    if (jeton) void charger(jeton);
  }, [jeton, charger]);

  const lignes = useMemo(() => {
    if (!donnees) return [];
    const recherche = filtre.trim().toLowerCase();

    return donnees.cadrages.filter((ligne) => {
      const jours = joursDepuis(ligne.majLe);
      const garde =
        onglet === 'tous' ||
        (onglet === 'a_chiffrer' && ligne.statut === 'valide') ||
        (onglet === 'dormants' && ligne.statut !== 'valide' && jours >= JOURS_DORMANT) ||
        (onglet === 'en_cours' && ligne.statut !== 'valide' && jours < JOURS_DORMANT);
      if (!garde) return false;

      if (!recherche) return true;
      return `${ligne.client.nom} ${ligne.client.metier} ${ligne.client.demande} ${
        ligne.client.courriel ?? ''
      }`
        .toLowerCase()
        .includes(recherche);
    });
  }, [donnees, onglet, filtre]);

  async function creer(): Promise<void> {
    if (!jeton) return;
    const nom = window.prompt('Nom du client ?')?.trim();
    if (!nom) return;
    const demande = window.prompt('Sa demande, en une ligne ?')?.trim() ?? '';

    try {
      const cree = await api.creerCadrage(jeton, { nom, demande });
      await navigator.clipboard?.writeText(cree.lien).catch(() => {});
      setMessage(`Lien créé et copié : ${cree.lien}`);
      await charger(jeton);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Création impossible.');
    }
  }

  async function copierLien(ligne: LigneCadrage): Promise<void> {
    const lien = `${window.location.origin}/?c=${ligne.token}`;
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(ligne.id);
      window.setTimeout(() => setCopie(null), 2000);
    } catch {
      setMessage(lien);
    }
  }

  async function supprimer(ligne: LigneCadrage): Promise<void> {
    if (!jeton) return;
    const confirme = window.confirm(
      `Supprimer le cadrage actif de ${ligne.client.nom}, réponses et fichiers compris ? Les copies de sauvegarde expirent avec la rotation (14 jours en production).`,
    );
    if (!confirme) return;
    try {
      await api.supprimerCadrage(jeton, ligne.id);
      setMessage(`Le cadrage actif de ${ligne.client.nom} a été supprimé.`);
      await charger(jeton);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Suppression impossible.');
    }
  }

  if (etat === 'jeton') {
    return (
      <FormulaireJeton
        message={message}
        onValider={(valeur) => {
          enregistrerJetonAdmin(valeur);
          setJeton(valeur);
        }}
      />
    );
  }

  const stats = donnees?.stats;
  const onglets: Array<{ cle: Onglet; texte: string }> = [
    { cle: 'tous', texte: `TOUS ${stats?.total ?? 0}` },
    { cle: 'en_cours', texte: `EN COURS ${stats?.enCours ?? 0}` },
    { cle: 'a_chiffrer', texte: `À CHIFFRER ${stats?.aChiffrer ?? 0}` },
    { cle: 'dormants', texte: `DORMANTS ${stats?.dormants ?? 0}` },
  ];

  return (
    <div className="dash">
      <header className="dash__head">
        <div className="dash__head-left">
          <span className="dash__brand">Studio Cazals / cadrages</span>
          <nav className="dash__tabs">
            {onglets.map((item) => (
              <button
                key={item.cle}
                type="button"
                aria-current={item.cle === onglet ? 'page' : undefined}
                className={item.cle === onglet ? 'dash__tab dash__tab--current' : 'dash__tab'}
                onClick={() => setOnglet(item.cle)}
              >
                {item.texte}
              </button>
            ))}
          </nav>
        </div>
        <div className="dash__head-right">
          <input
            type="search"
            className="dash__filter"
            placeholder="Filtrer…"
            aria-label="Filtrer les cadrages"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
          />
          <button type="button" className="dash__new" onClick={() => void creer()}>
            + NOUVEAU LIEN
          </button>
          <button type="button" className="dash__theme" onClick={onToggleTheme}>
            THÈME
          </button>
        </div>
      </header>

      <div className="dash__stats">
        <Stat label="TAUX D'ACHÈVEMENT" valeur={`${stats?.tauxAchevement ?? 0} %`} />
        <Stat
          label="DURÉE MÉDIANE"
          valeur={stats?.dureeMedianeMs ? `${minutes(stats.dureeMedianeMs)} min` : '—'}
        />
        <Stat label="CHEMIN RAPIDE" valeur={`${stats?.parVoieRapide ?? 0} / ${stats?.total ?? 0}`} />
        <Stat label="TENSIONS OUVERTES" valeur={String(stats?.tensionsOuvertes ?? 0)} accent />
      </div>

      {message && (
        <p className="dash__message" role="status">
          {message}
        </p>
      )}

      <div className="dash__scroll">
        <table className="dash__table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column}>{column}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne) => {
              const marque = badge(ligne);
              const dormant = ligne.statut !== 'valide' && joursDepuis(ligne.majLe) >= JOURS_PAUSE;

              return (
                <tr key={ligne.id} className="dash__row">
                  <td>
                    <span className="dash__client">{ligne.client.nom}</span>
                    <span className="dash__client-meta">{ligne.client.metier}</span>
                    {ligne.client.courriel && (
                      <a
                        className="dash__client-meta"
                        href={`mailto:${ligne.client.courriel}`}
                      >
                        {ligne.client.courriel}
                      </a>
                    )}
                  </td>
                  <td className="dash__demande">{ligne.client.demande}</td>
                  <td className="dash__cover">
                    <span className="dash__cover-count">
                      {ligne.couverture}/{POINTS.length}
                    </span>
                    <Pips ligne={ligne} />
                  </td>
                  <td className="dash__voie">{voieLisible(ligne)}</td>
                  <td>
                    <span className={marque.classe}>{marque.texte}</span>
                  </td>
                  <td className="dash__signal">{depuis(ligne.majLe)}</td>
                  <td className="dash__actions">
                    <span className="dash__action-group">
                      {dormant ? (
                        <button
                          type="button"
                          className="dash__action"
                          onClick={() => void copierLien(ligne)}
                        >
                          {copie === ligne.id ? 'LIEN COPIÉ' : 'RELANCER'}
                        </button>
                      ) : (
                        <a
                          className="dash__action"
                          href={`/?c=${ligne.token}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {ligne.statut === 'valide' ? 'OUVRIR' : 'SUIVRE'}
                        </a>
                      )}
                      <button
                        type="button"
                        className="dash__action dash__action--danger"
                        onClick={() => void supprimer(ligne)}
                      >
                        SUPPRIMER
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="dash__foot">
        {etat === 'chargement'
          ? 'Chargement…'
          : `${lignes.length} ligne${lignes.length > 1 ? 's' : ''} sur ${stats?.total ?? 0} · tri par dernier signal`}
      </p>
    </div>
  );
}

function Stat({ label, valeur, accent }: { label: string; valeur: string; accent?: boolean }) {
  return (
    <div className="dash__stat">
      <span className="dash__stat-label">{label}</span>
      <span className={accent ? 'dash__stat-value dash__stat-value--accent' : 'dash__stat-value'}>
        {valeur}
      </span>
    </div>
  );
}

/**
 * Le jeton n'est jamais dans l'URL : il est saisi ici et gardé sur le poste du
 * prestataire. Un lien partagé par erreur ne donne donc accès à rien.
 */
function FormulaireJeton({
  message,
  onValider,
}: {
  message: string | null;
  onValider: (jeton: string) => void;
}) {
  const [valeur, setValeur] = useState('');

  return (
    <main className="etat-simple">
      <div className="etat-simple__bloc">
        <p className="lbl etat-simple__kicker">Studio Cazals / cadrages</p>
        <h1 className="serif etat-simple__titre">Votre jeton d'administration.</h1>
        <p className="etat-simple__texte">
          Il se trouve dans <code>server/data/admin-token.txt</code>, ou dans la variable
          d'environnement <code>CADRAGE_ADMIN_TOKEN</code>.
        </p>
        <form
          className="etat-simple__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valeur.trim()) onValider(valeur.trim());
          }}
        >
          <input
            type="password"
            className="rapide__link"
            aria-label="Jeton d'administration"
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="btn btn--primary etat-simple__btn">
            Ouvrir le tableau
          </button>
        </form>
        {message && (
          <p className="etat-simple__erreur" role="alert">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
