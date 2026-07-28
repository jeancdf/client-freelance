import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useCadrage } from '../CadrageContext';
import { AppHeader } from '../components/Headers';
import { Attente } from '../components/Attente';
import { INDEX_HORS_PERIMETRE, POINTS } from '../../shared/points';
import type { AnalyseGeneree, Fichier } from '../../shared/api';
import * as api from '../lib/api';

/** Ce que la lecture du document a laissé de côté, dans l'ordre des points. */
const GAPS = [
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

/** Le panneau de couverture, identique qu'il vienne du modèle ou de la maquette. */
function Couverture({
  titre,
  manques,
  couverts,
  resume,
}: {
  titre: string;
  manques: Array<{ label: string; text: string }>;
  couverts: string[];
  resume: string;
}) {
  return (
    <>
      <h2 className="serif rapide__aside-title">{titre}</h2>

      <ul className="rapide__gaps">
        {manques.map((manque) => (
          <li key={manque.label}>
            <p className="rapide__gap-label">{manque.label}</p>
            <p className="rapide__gap-text">{manque.text}</p>
          </li>
        ))}
      </ul>

      {couverts.length > 0 && (
        <details className="rapide__covered">
          <summary className="rapide__covered-summary">{resume}</summary>
          <ul className="rapide__covered-list">
            {couverts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

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

  const [analyse, setAnalyse] = useState<AnalyseGeneree | null>(null);
  const [lecture, setLecture] = useState<'repos' | 'encours' | 'erreur'>('repos');
  /** Des documents sont arrivés depuis la dernière lecture. */
  const [aRelire, setARelire] = useState(false);

  const brief = state.brief;

  const lire = useCallback(async (): Promise<void> => {
    if (!session) return;
    setLecture('encours');
    setARelire(false);
    try {
      // L'enregistrement de fond est différé d'une demi-seconde : sans cette
      // écriture, le serveur analyserait le texte d'avant, ou rien du tout.
      await api.patcher(session.token, { brief });
      const resultat = await api.analyser(session.token);
      setAnalyse(resultat);
      dispatch({ type: 'horsPerimetre', decision: resultat.horsPerimetre });
      setLecture('repos');
    } catch {
      setLecture('erreur');
    }
  }, [session, brief, dispatch]);

  /** Lit, sauf si une lecture a déjà eu lieu : elle sera relancée à la demande. */
  const lireOuSignaler = useCallback(() => {
    if (analyse) setARelire(true);
    else void lire();
  }, [analyse, lire]);

  // À l'ouverture de l'écran seulement : le client revient sur un dossier où il
  // a déjà déposé quelque chose, il doit retrouver sa lecture sans la demander.
  // Le résultat est en cache côté serveur, revenir ne regénère rien.
  const auMontage = useRef(false);
  useEffect(() => {
    if (auMontage.current || !session) return;
    auMontage.current = true;
    if (fichiers.length > 0 || brief.trim()) void lire();
  }, [session, fichiers.length, brief, lire]);

  // Pour un document qui n'évoque aucun besoin supplémentaire, l'analyse rend
  // le point VI « non applicable » sous la forme couvert + vide. Il disparaît
  // alors entièrement, au lieu de devenir artificiellement une question.
  const pointsUtiles = analyse
    ? analyse.points.filter(
        (point) =>
          point.index !== INDEX_HORS_PERIMETRE ||
          !point.couvert ||
          Boolean(point.extrait.trim() || point.reponse.trim()),
      )
    : [];
  const manques = pointsUtiles.filter((p) => !p.couvert);
  const couverts = pointsUtiles.filter((p) => p.couvert);

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
      if (deposes.length) {
        dispatch({ type: 'fichiers', fichiers: [...fichiers, ...deposes] });
        // Le dépôt suffit à lancer la lecture : le client a déposé son
        // document, il n'a pas à demander en plus qu'on le lise. Mais on ne
        // relance pas seul une lecture déjà faite — il ajoute parfois trois
        // fichiers de suite, et chaque analyse se paie.
        lireOuSignaler();
      }
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
                // À la sortie du champ, pas à chaque frappe : lire à chaque
                // touche enfoncée lancerait une analyse sur trois mots.
                onBlur={() => {
                  if (session && brief.trim().length > 40) lireOuSignaler();
                }}
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

            {/* Hors session, l'écran garde le cas complet de la maquette : c'est
                à ça que sert /demo. Sur un dossier réel, rien n'est affiché tant
                que le document n'est pas lu — surtout pas la couverture d'un
                autre client. */}
            {!session ? (
              <Couverture
                titre="Cinq points sur sept sont couverts. Il en manque deux."
                manques={GAPS}
                couverts={COVERED}
                resume="Les cinq points déjà couverts"
              />
            ) : lecture === 'encours' ? (
              <Attente
                texte="Je lis votre document…"
                duree={18}
                note="Je cherche les points utiles qu'il couvre déjà."
              />
            ) : lecture === 'erreur' ? (
              <div>
                <h2 className="serif rapide__aside-title">Je n'ai pas pu lire vos documents.</h2>
                <button type="button" className="btn btn--outline rapide__relire" onClick={() => void lire()}>
                  Réessayer
                </button>
              </div>
            ) : !analyse ? (
              <h2 className="serif rapide__aside-title">
                Déposez un document ou décrivez votre projet : je vous dirai ce qu'il manque.
              </h2>
            ) : (
              <>
                <Couverture
                  titre={
                    manques.length === 0
                      ? `Tous les points utiles sont couverts.`
                      : `${couverts.length} ${
                          couverts.length > 1 ? 'points' : 'point'
                        } sur ${pointsUtiles.length} ${
                          couverts.length > 1 ? 'sont couverts' : 'est couvert'
                        }. Il en manque ${manques.length}.`
                  }
                  manques={manques.map((p) => ({
                    label: `${POINTS[p.index].num} — ${POINTS[p.index].label}`,
                    text: p.manque,
                  }))}
                  couverts={couverts.map((p) => `${POINTS[p.index].label} — « ${p.extrait} »`)}
                  resume={`Les ${couverts.length} points déjà couverts`}
                />

                {/* L'extraction PDF et Word manque : le dire plutôt que de
                    laisser croire que tout a été lu. */}
                {analyse.fichiersIllisibles.length > 0 && (
                  <p className="rapide__illisible">
                    Je n'ai pas pu lire {analyse.fichiersIllisibles.join(', ')} — collez le texte
                    dans le champ, ou décrivez-le en deux phrases.
                  </p>
                )}

                {aRelire && (
                  <button
                    type="button"
                    className="btn btn--outline rapide__relire"
                    onClick={() => void lire()}
                  >
                    Relire avec les nouveaux documents
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              className="btn btn--primary rapide__submit"
              onClick={() => dispatch({ type: 'completeRapide' })}
              disabled={lecture === 'encours'}
            >
              {!session
                ? 'Compléter les trois points'
                : analyse
                  ? manques.length === 0
                    ? 'Relire mon dossier'
                    : `Compléter ${manques.length === 1 ? 'le point manquant' : `les ${manques.length} points manquants`}`
                  : 'Passer aux questions'}
            </button>
            <p className="rapide__submit-note">Seulement ce qui manque</p>
          </aside>
        </div>

        <div className="rapide__tail" />
      </main>
    </div>
  );
}
