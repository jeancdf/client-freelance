import { useRef, useState, type DragEvent } from 'react';
import { useCadrage } from '../CadrageContext';
import { AppHeader } from '../components/Headers';
import type { Fichier } from '../../shared/api';
import * as api from '../lib/api';

/** Ce que la lecture du document a laissé de côté, dans l'ordre des points. */
const GAPS = [
  {
    label: 'VI — Le hors-périmètre',
    text: "Ce que le projet ne fera pas n'apparaît nulle part. C'est le point qui fait déraper les budgets.",
  },
  {
    label: 'VII — Les contraintes',
    text: "Une date de mise en ligne est citée page 4, mais rien sur l'hébergement ni sur qui reprend la maintenance.",
  },
  {
    label: 'VIII — La définition du succès',
    text: 'À quoi vous saurez, dans six mois, que ça valait le coup.',
  },
];

const COVERED = [
  'Le problème — p. 1',
  'Les utilisateurs — p. 2',
  'Le fonctionnement actuel — p. 2',
  "L'existant à reprendre — p. 3",
  'Le périmètre — p. 3 à 5',
];

/** Les fichiers figés de la maquette, quand on tourne sans dossier réel. */
const FICHIERS_DEMO: Fichier[] = [
  {
    id: 'demo-1',
    nom: 'Cahier_des_charges_App_Coaching_v3.pdf',
    taille: 1_258_291,
    typeMime: 'application/pdf',
    deposeLe: '',
  },
  {
    id: 'demo-2',
    nom: 'Maquettes_ecrans_seance.png',
    taille: 348_160,
    typeMime: 'image/png',
    deposeLe: '',
  },
];

function poids(octets: number): string {
  if (octets >= 1_000_000) return `${(octets / 1_048_576).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

export function Rapide() {
  const { state, dispatch } = useCadrage();
  const session = state.session;
  const fichiers = session ? session.fichiers : FICHIERS_DEMO;

  const champFichier = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function deposer(liste: FileList | null): Promise<void> {
    if (!liste?.length) return;
    if (!session) {
      setErreur("Démonstration — ouvrez votre lien pour déposer un document.");
      return;
    }

    setEnvoi(true);
    setErreur(null);
    const deposes: Fichier[] = [];
    try {
      // Un par un : la limite de taille est par fichier, et un refus ne doit
      // pas faire perdre ceux qui sont déjà passés.
      for (const fichier of Array.from(liste)) {
        deposes.push(await api.deposerFichier(session.token, fichier));
      }
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Le dépôt a échoué.');
    } finally {
      if (deposes.length) dispatch({ type: 'fichiers', fichiers: [...fichiers, ...deposes] });
      setEnvoi(false);
    }
  }

  async function retirer(id: string): Promise<void> {
    if (!session) return;
    try {
      await api.retirerFichier(session.token, id);
      dispatch({ type: 'fichiers', fichiers: fichiers.filter((f) => f.id !== id) });
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Le retrait a échoué.');
    }
  }

  function surDepot(evenement: DragEvent<HTMLDivElement>): void {
    evenement.preventDefault();
    setSurvol(false);
    void deposer(evenement.dataTransfer.files);
  }

  return (
    <div>
      <AppHeader mode="Dépôt de document" saved />

      <main className="rapide__main">
        <div className="rapide__intro">
          <h1 className="serif rapide__title">
            Déposez ce que vous avez. Je lis, puis je ne vous demande que ce qui manque.
          </h1>
          <p className="rapide__lead">
            Document, notes brutes, capture d'un tableau, liens vers l'existant : tout est utile,
            même incomplet. Rien de ce que vous écrivez ne sera reformulé sans votre accord.
          </p>
        </div>

        <div className="rapide__grid">
          <div>
            <section className="card rapide__brief">
              <label htmlFor="brief" className="answer__label">
                Votre projet, écrit ou collé
              </label>
              <textarea
                id="brief"
                rows={9}
                className="rapide__brief-input"
                value={state.brief}
                onChange={(e) => dispatch({ type: 'setBrief', value: e.target.value })}
                placeholder="Collez votre cahier des charges, ou décrivez le projet en quelques paragraphes."
              />
            </section>

            <section className="rapide__section">
              <p className="lbl rapide__section-label">Fichiers</p>

              {fichiers.length > 0 && (
                <ul className="rapide__files">
                  {fichiers.map((fichier) => (
                    <li key={fichier.id} className="rapide__file">
                      <span className="rapide__file-info">
                        {session ? (
                          <a
                            className="rapide__file-name rapide__file-name--truncate"
                            href={api.lienFichier(session.token, fichier.id)}
                          >
                            {fichier.nom}
                          </a>
                        ) : (
                          <span className="rapide__file-name rapide__file-name--truncate">
                            {fichier.nom}
                          </span>
                        )}
                        <span className="rapide__file-meta">{poids(fichier.taille)} · déposé</span>
                      </span>
                      <button
                        type="button"
                        className="rapide__file-remove"
                        onClick={() => void retirer(fichier.id)}
                      >
                        Retirer
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div
                className={survol ? 'rapide__drop rapide__drop--survol' : 'rapide__drop'}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSurvol(true);
                }}
                onDragLeave={() => setSurvol(false)}
                onDrop={surDepot}
              >
                <p className="rapide__drop-text">
                  {envoi ? 'Dépôt en cours…' : 'Glissez vos fichiers ici'}
                </p>
                <input
                  ref={champFichier}
                  type="file"
                  multiple
                  className="rapide__drop-input"
                  onChange={(e) => {
                    void deposer(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn btn--outline rapide__drop-btn"
                  onClick={() => champFichier.current?.click()}
                  disabled={envoi}
                >
                  Parcourir
                </button>
                <p className="rapide__drop-note">
                  PDF, Word, images, tableurs · 25 Mo par fichier
                </p>
              </div>

              {erreur && (
                <p className="rapide__erreur" role="alert">
                  {erreur}
                </p>
              )}
            </section>

            <section>
              <p className="lbl rapide__section-label">Liens vers l'existant</p>
              <div className="rapide__links">
                <input
                  type="url"
                  className="rapide__link"
                  aria-label="Premier lien vers l'existant"
                  placeholder="https://"
                  value={state.lien1}
                  onChange={(e) => dispatch({ type: 'setLien1', value: e.target.value })}
                />
                <input
                  type="url"
                  className="rapide__link"
                  aria-label="Second lien vers l'existant"
                  placeholder="https://"
                  value={state.lien2}
                  onChange={(e) => dispatch({ type: 'setLien2', value: e.target.value })}
                />
              </div>
            </section>
          </div>

          <aside className="rapide__aside">
            <p className="lbl rapide__aside-label">Lecture de votre document</p>
            <h2 className="serif rapide__aside-title">
              Cinq points sur huit sont couverts. Il en manque trois.
            </h2>

            <ul className="rapide__gaps">
              {GAPS.map((gap) => (
                <li key={gap.label}>
                  <p className="rapide__gap-label">{gap.label}</p>
                  <p className="rapide__gap-text">{gap.text}</p>
                </li>
              ))}
            </ul>

            <details className="rapide__covered">
              <summary className="rapide__covered-summary">Les cinq points déjà couverts</summary>
              <ul className="rapide__covered-list">
                {COVERED.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>

            <button
              type="button"
              className="btn btn--primary rapide__submit"
              onClick={() => dispatch({ type: 'completeRapide' })}
            >
              Compléter les trois points
            </button>
            <p className="rapide__submit-note">Quatre minutes environ</p>
          </aside>
        </div>

        <div className="rapide__tail" />
      </main>
    </div>
  );
}
