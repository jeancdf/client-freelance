import { useState } from 'react';
import type {
  CompteRendu,
  CompteRenduGenere,
  ElementCompteRendu,
} from '../../shared/api';
import { POINTS } from '../../shared/points';
import { AppHeader } from '../components/Headers';
import { Attente } from '../components/Attente';
import { useCadrage } from '../CadrageContext';
import * as api from '../lib/api';
import { dateLongue, minutes } from '../lib/dates';
import { answerOf, indicesPointsVisibles } from '../state';

type Onglet = 'sources' | 'rapport';
type EtatRapport = 'repos' | 'chargement' | 'pret' | 'erreur';

const RAPPORT_DEMO: CompteRendu = {
  titre: 'Centraliser les commandes du réseau',
  resumeExecutif: [
    'Le projet vise à remplacer des échanges dispersés par un portail de commande commun aux points de vente.',
    'La première version doit concentrer les opérations les plus fréquentes, tout en gardant visibles les décisions encore nécessaires sur les accès et les intégrations.',
  ],
  contexte: [
    'Les commandes sont aujourd’hui préparées et suivies avec plusieurs supports.',
    'Cette dispersion augmente le temps de reprise et rend le suivi moins lisible.',
  ],
  objectifs: [
    'Réunir la préparation, l’envoi et le suivi des commandes dans un même parcours.',
    'Donner une vision commune de l’avancement aux personnes concernées.',
  ],
  perimetre: [
    'Traiter en priorité les commandes habituelles des points de vente.',
    'Reporter les cas exceptionnels qui ne sont pas encore décrits.',
  ],
  personnesEtParcours: [
    'Les points de vente préparent leurs commandes puis suivent leur traitement.',
    'L’équipe centrale contrôle les demandes et met à jour leur état.',
  ],
  contraintesEtDecisions: [
    'Le document existant reste une référence du projet.',
    'Le calendrier et le budget doivent encore être rapprochés du périmètre retenu.',
  ],
  pointsVigilance: [
    {
      titre: 'Des cas exceptionnels encore peu décrits',
      texte:
        'Ils peuvent modifier les règles de validation et le volume de travail s’ils entrent dans la première version.',
      sources: [2, 5],
    },
  ],
  questionsOuvertes: [
    {
      titre: 'Accès et responsabilités',
      texte: 'Les droits exacts de chaque profil restent à confirmer avant le chiffrage.',
      sources: [3],
    },
  ],
  recommandations: [
    {
      titre: 'Commencer par le parcours courant',
      texte:
        'Une première version centrée sur les commandes habituelles permettrait de valider les règles avant d’ajouter les exceptions.',
      sources: [1, 2],
    },
  ],
  prochainesEtapes: [
    'Confirmer les questions encore ouvertes avec les personnes concernées.',
    'Transformer le périmètre retenu en proposition chiffrée.',
  ],
};

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ListeRapport({
  titre,
  elements,
}: {
  titre: string;
  elements: string[];
}) {
  if (!elements.length) return null;
  return (
    <section className="report__section">
      <h2 className="serif report__section-title">{titre}</h2>
      <ul className="report__list">
        {elements.map((element) => (
          <li key={element}>{element}</li>
        ))}
      </ul>
    </section>
  );
}

function SourcesPoints({ sources }: { sources: number[] }) {
  return (
    <span className="report__sources" aria-label="Points sources">
      {sources
        .map((index) => POINTS[index]?.num)
        .filter(Boolean)
        .join(' · ')}
    </span>
  );
}

function BlocsRapport({
  titre,
  elements,
  variante,
}: {
  titre: string;
  elements: ElementCompteRendu[];
  variante: 'vigilance' | 'question' | 'recommandation';
}) {
  if (!elements.length) return null;
  return (
    <section className="report__section">
      <h2 className="serif report__section-title">{titre}</h2>
      <div className={`report__cards report__cards--${variante}`}>
        {elements.map((element) => (
          <article className="report__card" key={`${element.titre}-${element.sources.join('-')}`}>
            <div className="report__card-head">
              <h3>{element.titre}</h3>
              <SourcesPoints sources={element.sources} />
            </div>
            <p>{element.texte}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Recap() {
  const { state, dispatch } = useCadrage();
  const session = state.session;
  const pointsVisibles = indicesPointsVisibles(state);
  const [onglet, setOnglet] = useState<Onglet>('sources');
  const [rapport, setRapport] = useState<CompteRenduGenere | null>(null);
  const [etatRapport, setEtatRapport] = useState<EtatRapport>('repos');
  const [erreurRapport, setErreurRapport] = useState('');
  const [envoi, setEnvoi] = useState<'repos' | 'envoi' | 'erreur'>('repos');
  const [messageErreur, setMessageErreur] = useState('');

  const pointsIncomplets = pointsVisibles.filter(
    (point) => state.answers[point] === undefined || !state.clos[point],
  );
  const tensionEnAttente = pointsVisibles.some(
    (point) => state.tensions[point] && !state.tensionResolved[point],
  );
  const reformulationEnAttente =
    state.mode === 'long' &&
    pointsVisibles.some(
      (point) => state.reformulations[point] && !state.confirmed[point],
    );
  const sourcesPretes =
    pointsIncomplets.length === 0 && !tensionEnAttente && !reformulationEnAttente;
  const rapportLu = !session || session.compteRenduLu;
  const pretAValider = sourcesPretes && rapportLu;

  const enTete = session
    ? `Cadrage — ${session.client.nom} · ${dateLongue(session.majLe)} · ${minutes(session.dureeMs)} minutes`
    : 'Cadrage — Camille Dorval · 12 mars 2026 · 17 minutes';

  async function enregistrerEtatCourant(): Promise<void> {
    if (!session) return;
    await api.patcher(session.token, {
      mode: state.mode,
      voie: state.voie,
      step: state.step,
      rang: state.rang,
      draft: state.draft,
      brief: state.brief,
      lien1: state.lien1,
      lien2: state.lien2,
    });
    for (const point of pointsVisibles) {
      if (
        !state.confirmed[point] &&
        !state.tensionResolved[point] &&
        !state.deductionsConfirmed[point]
      ) {
        continue;
      }
      const arbitrage = state.arbitrages[point];
      await api.marquerReponse(session.token, point, {
        confirme: Boolean(state.confirmed[point]),
        arbitre: Boolean(state.tensionResolved[point]),
        ...(arbitrage && arbitrage.choix !== 'legacy_unknown' ? { arbitrage } : {}),
        deductionConfirmee: Boolean(state.deductionsConfirmed[point]),
      });
    }
  }

  async function chargerRapport(): Promise<void> {
    setOnglet('rapport');
    if (!sourcesPretes || etatRapport === 'chargement') return;
    if (rapport) return;
    if (!session) {
      setRapport({
        compteRendu: RAPPORT_DEMO,
        origine: 'modele',
        genereLe: new Date().toISOString(),
      });
      setEtatRapport('pret');
      return;
    }

    setEtatRapport('chargement');
    setErreurRapport('');
    try {
      await enregistrerEtatCourant();
      const genere = await api.lireCompteRendu(session.token);
      await api.marquerCompteRenduLu(session.token);
      setRapport(genere);
      setEtatRapport('pret');
      dispatch({ type: 'compteRenduLu' });
    } catch (cause) {
      setEtatRapport('erreur');
      setErreurRapport(
        cause instanceof Error
          ? cause.message
          : "Le compte rendu IA n'a pas pu être généré.",
      );
    }
  }

  function confirmerDeduction(point: number): void {
    dispatch({ type: 'confirmDeduction', point });
    setRapport(null);
    setEtatRapport('repos');
  }

  async function valider(): Promise<void> {
    if (!session) {
      dispatch({ type: 'goScreen', screen: 'fin' });
      return;
    }
    if (!pretAValider) return;
    setEnvoi('envoi');
    setMessageErreur('');
    try {
      await enregistrerEtatCourant();
      const resultat = await api.validerDossier(session.token);
      dispatch({
        type: 'dossierValide',
        valideLe: resultat.valideLe,
        dureeMs: resultat.dureeMs,
      });
      dispatch({ type: 'goScreen', screen: 'fin' });
    } catch (cause) {
      setEnvoi('erreur');
      setMessageErreur(
        cause instanceof Error ? cause.message : "La validation n'a pas abouti.",
      );
    }
  }

  const document = rapport?.compteRendu;

  function exporterPdf(): void {
    if (!document) return;
    const titrePrecedent = window.document.title;
    const restaurer = () => {
      window.document.title = titrePrecedent;
    };
    window.addEventListener('afterprint', restaurer, { once: true });
    window.document.title = `Compte rendu — ${document.titre}`;
    window.print();
  }

  return (
    <div>
      <AppHeader mode="Récapitulatif" saved />

      <main className="recap__main">
        <div className="recap__head no-print">
          <p className="lbl recap__kicker">{enTete}</p>
          <h1 className="serif recap__title">Deux lectures, un même projet.</h1>
          <p className="recap__lead">
            Vérifiez vos réponses, puis ouvrez le compte rendu rédigé par l’IA. Toute correction
            produira une nouvelle version avant la validation.
          </p>
        </div>

        <div className="recap__tabs no-print" role="tablist" aria-label="Lectures du cadrage">
          <button
            type="button"
            role="tab"
            aria-selected={onglet === 'sources'}
            className={onglet === 'sources' ? 'recap__tab recap__tab--active' : 'recap__tab'}
            onClick={() => setOnglet('sources')}
          >
            Vos réponses
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={onglet === 'rapport'}
            className={onglet === 'rapport' ? 'recap__tab recap__tab--active' : 'recap__tab'}
            onClick={() => void chargerRapport()}
          >
            Compte rendu IA
            {rapportLu && <span className="recap__tab-check">Lu</span>}
          </button>
        </div>

        {onglet === 'sources' ? (
          <div role="tabpanel" className="recap__panel">
            <div className="legend">
              <p className="lbl legend__label">Trois écritures, pour que rien ne se confonde</p>
              <div className="legend__list">
                <p className="legend__row legend__row--quoted">
                  <span className="legend__lede">En romain entre guillemets :</span> vos mots,
                  exactement comme vous les avez écrits.
                </p>
                <p className="legend__row">
                  Avec la mention{' '}
                  <span className="legend__mention">reformulé · confirmé</span> : la formulation
                  que vous avez acceptée.
                </p>
                <p className="legend__row">
                  Sur fond crème, avec la mention{' '}
                  <span className="legend__mention">déduit</span> : une hypothèse à confirmer ou
                  corriger.
                </p>
              </div>
            </div>

            {pointsVisibles.map((k) => {
              const point = POINTS[k];
              const repondu = state.answers[k] !== undefined;
              const afficher = repondu || !session;
              const reformule = session
                ? repondu && Boolean(state.confirmed[k])
                : Boolean(point.reform);
              const deduit = session ? state.deductions[k] : point.deduit;
              const deductionConfirmee = Boolean(state.deductionsConfirmed[k]);
              const reformulation = session ? state.reformulations[k] : point.reform;
              const sourceDocument = session && state.sources[k] === 'document';
              const arbitrage = state.arbitrages[k];

              return (
                <section key={point.num} className="recap__section">
                  <h2 className="recap__section-title">
                    {point.num} — {point.label}
                  </h2>
                  <div className="recap__blocks">
                    {afficher ? (
                      sourceDocument ? (
                        <div>
                          <p className="lbl recap__sub-label">Synthèse du document · acceptée</p>
                          <p className="recap__reform">{answerOf(state, k)}</p>
                        </div>
                      ) : (
                        <p className="recap__quote">« {answerOf(state, k)} »</p>
                      )
                    ) : (
                      <p className="recap__manquant">Pas encore renseigné.</p>
                    )}

                    {reformule && reformulation && (
                      <div>
                        <p className="lbl recap__sub-label">Reformulé · confirmé</p>
                        <p className="recap__reform">{capitalise(reformulation)}</p>
                      </div>
                    )}

                    {arbitrage && (
                      <div className="recap__arbitrage">
                        <p className="lbl recap__sub-label">Arbitrage retenu</p>
                        <p>{arbitrage.libelle}</p>
                      </div>
                    )}

                    {afficher && deduit && (
                      <div className="recap__deduit">
                        <p className="lbl recap__sub-label">Déduit — vous ne me l’avez pas dit</p>
                        <p className="recap__deduit-text">{deduit}</p>
                        <div className="recap__deduit-actions">
                          <button
                            type="button"
                            className="btn btn--soft recap__deduit-btn"
                            disabled={deductionConfirmee}
                            onClick={() => confirmerDeduction(k)}
                          >
                            {deductionConfirmee ? 'Hypothèse confirmée' : 'C’est juste'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--underline recap__deduit-btn"
                            onClick={() => dispatch({ type: 'goStep', step: k })}
                          >
                            Corriger
                          </button>
                        </div>
                      </div>
                    )}

                    {afficher && point.ouvert && (
                      <div className="recap__ouvert">
                        <p className="lbl recap__sub-label">Resté ouvert — à traiter au rendez-vous</p>
                        <p className="recap__ouvert-text">{point.ouvert}</p>
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn--accent recap__edit"
                      onClick={() => dispatch({ type: 'goStep', step: k })}
                    >
                      {repondu || !session ? 'Modifier ce point' : 'Répondre à ce point'}
                    </button>
                  </div>
                </section>
              );
            })}

            {sourcesPretes && !rapportLu && (
              <div className="recap__report-cta">
                <p className="lbl">Dernière lecture obligatoire</p>
                <h2 className="serif">Transformez ces réponses en compte rendu.</h2>
                <p>
                  L’IA va maintenant hiérarchiser les faits, les décisions, les risques et les
                  prochaines étapes sans modifier vos réponses.
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void chargerRapport()}
                >
                  Générer le compte rendu IA
                </button>
              </div>
            )}
          </div>
        ) : (
          <div role="tabpanel" className="recap__panel report">
            {!sourcesPretes ? (
              <div className="report__empty">
                <h2 className="serif">Le dossier doit d’abord être complet.</h2>
                <p>Terminez les réponses, confirmations et arbitrages avant la rédaction.</p>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setOnglet('sources')}
                >
                  Revenir aux réponses
                </button>
              </div>
            ) : etatRapport === 'chargement' ? (
              <Attente
                texte="Je rédige votre compte rendu…"
                duree={18}
                note="Les faits restent inchangés ; l’IA travaille leur structure et leur hiérarchie."
              />
            ) : etatRapport === 'erreur' ? (
              <div className="report__empty" role="alert">
                <p className="lbl">Génération interrompue</p>
                <h2 className="serif">Le compte rendu n’est pas disponible.</h2>
                <p>{erreurRapport}</p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void chargerRapport()}
                >
                  Réessayer
                </button>
              </div>
            ) : document ? (
              <>
                <div className="report__actions no-print">
                  <p className="note">
                    Généré le {dateLongue(rapport.genereLe)} · toute correction créera une nouvelle
                    version.
                  </p>
                  <button
                    type="button"
                    className="btn btn--outline"
                    onClick={exporterPdf}
                  >
                    Exporter en PDF
                  </button>
                </div>

                <article className="report__paper">
                  <header className="report__header">
                    <p className="lbl report__eyebrow">
                      Compte rendu de cadrage · {session?.client.nom ?? 'Camille Dorval'}
                    </p>
                    <h1 className="serif report__title">{document.titre}</h1>
                    <p className="report__meta">
                      {session?.client.metier || 'Activité du client'} ·{' '}
                      {session ? dateLongue(session.majLe) : '12 mars 2026'}
                    </p>
                  </header>

                  <section className="report__executive">
                    <p className="lbl">En bref</p>
                    {document.resumeExecutif.map((paragraphe) => (
                      <p key={paragraphe}>{paragraphe}</p>
                    ))}
                  </section>

                  <ListeRapport titre="Contexte et problème de départ" elements={document.contexte} />
                  <ListeRapport titre="Objectifs attendus" elements={document.objectifs} />
                  <ListeRapport titre="Périmètre et priorités" elements={document.perimetre} />
                  <ListeRapport
                    titre="Personnes et parcours concernés"
                    elements={document.personnesEtParcours}
                  />
                  <ListeRapport
                    titre="Contraintes et décisions"
                    elements={document.contraintesEtDecisions}
                  />
                  <BlocsRapport
                    titre="Points de vigilance"
                    elements={document.pointsVigilance}
                    variante="vigilance"
                  />
                  <BlocsRapport
                    titre="Questions encore ouvertes"
                    elements={document.questionsOuvertes}
                    variante="question"
                  />
                  <BlocsRapport
                    titre="Pistes proposées"
                    elements={document.recommandations}
                    variante="recommandation"
                  />
                  <ListeRapport titre="Prochaines étapes" elements={document.prochainesEtapes} />

                  {(state.lien1 || state.lien2 || session?.fichiers.length) && (
                    <section className="report__section report__references">
                      <h2 className="serif report__section-title">Références fournies</h2>
                      <ul className="report__list">
                        {[state.lien1, state.lien2].filter(Boolean).map((lien) => (
                          <li key={lien}>
                            <a href={lien} target="_blank" rel="noreferrer">
                              {lien}
                            </a>
                          </li>
                        ))}
                        {session?.fichiers.map((fichier) => (
                          <li key={fichier.id}>{fichier.nom}</li>
                        ))}
                      </ul>
                      <p className="note">
                        Leur présence est signalée ici ; leur contenu n’est retenu que lorsqu’il a
                        été analysé puis accepté dans les réponses.
                      </p>
                    </section>
                  )}
                </article>
              </>
            ) : (
              <div className="report__empty">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void chargerRapport()}
                >
                  Générer le compte rendu IA
                </button>
              </div>
            )}
          </div>
        )}

        <div className="recap__foot no-print">
          <p className="recap__foot-text">
            Un point vous semble faux ? Corrigez sa réponse source : le compte rendu sera ensuite
            régénéré.
          </p>
          <div className="recap__foot-actions">
            <button
              type="button"
              className="btn btn--primary recap__validate"
              onClick={() => void valider()}
              disabled={envoi === 'envoi' || !pretAValider}
            >
              {envoi === 'envoi'
                ? 'Validation en cours…'
                : !sourcesPretes
                  ? 'Terminer les points avant de valider'
                  : !rapportLu
                    ? 'Ouvrir le compte rendu avant de valider'
                    : 'Valider mon dossier'}
            </button>
          </div>
          {envoi === 'erreur' && (
            <p className="recap__erreur" role="alert">
              {messageErreur} Vos réponses restent enregistrées.
            </p>
          )}
          <p className="recap__foot-note">
            Après validation, Nicolas retrouve ce dossier dans son tableau de suivi.
          </p>
        </div>
      </main>
    </div>
  );
}
