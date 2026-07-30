import { useEffect, useRef, useState } from 'react';
import { useCadrage } from '../CadrageContext';
import { AppHeader } from '../components/Headers';
import { Attente } from '../components/Attente';
import {
  lireContraintes,
  POINTS,
  questionsMinimales,
  serialiserContraintes,
  type ConfigurationContraintes,
} from '../../shared/points';
import {
  currentIndex,
  echangeCourant,
  indicesPointsVisibles,
  ouvertureOf,
  questionConnue,
  questionPrecedente,
  questionSuivante,
} from '../state';

const LAST = POINTS.length - 1;

/**
 * L'arbitrage écrit dans la maquette. Il ne sert qu'à la démonstration : sur un
 * dossier réel, le bandeau n'apparaît que porté par une contradiction relevée
 * par le modèle, jamais par ce texte.
 */
const MAQUETTE_TENSION = {
  explication:
    "Vous m'avez dit que vos clients ne sont pas à l'aise avec les applications. Là, vous mettez au cœur du projet la saisie des charges à chaque série, par eux. Les deux peuvent tenir, mais il faut savoir ce qui compte le plus — ça change ce qu'on construit.",
  optionA: "La simplicité passe d'abord",
  optionB: "Le suivi des charges passe d'abord",
};

function ConfirmationCorrection({
  ouverte,
  nombre,
  annuler,
  confirmer,
}: {
  ouverte: boolean;
  nombre: number;
  annuler: () => void;
  confirmer: () => void;
}) {
  const dialogueRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogue = dialogueRef.current;
    if (!dialogue) return;
    if (ouverte && !dialogue.open) dialogue.showModal();
    if (!ouverte && dialogue.open) dialogue.close();
  }, [ouverte]);

  return (
    <dialog
      ref={dialogueRef}
      className="correction-modal"
      aria-labelledby="correction-modal-title"
      aria-describedby="correction-modal-description"
      onCancel={annuler}
      onClose={annuler}
      onClick={(event) => {
        if (event.target === event.currentTarget) annuler();
      }}
    >
      <div className="correction-modal__body">
        <p className="lbl correction-modal__kicker">Correction d’une réponse</p>
        <h2 id="correction-modal-title" className="serif correction-modal__title">
          Adapter les questions suivantes ?
        </h2>
        <p id="correction-modal-description" className="correction-modal__text">
          Cette correction supprimera {nombre}{' '}
          {nombre > 1 ? 'réponses suivantes' : 'réponse suivante'} de ce point.
          L’IA adaptera ensuite ses questions à votre nouvelle réponse.
        </p>
      </div>
      <div className="correction-modal__actions">
        <button
          type="button"
          className="btn btn--outline correction-modal__button"
          onClick={annuler}
          autoFocus
        >
          Annuler
        </button>
        <button
          type="button"
          className="btn btn--primary correction-modal__button"
          onClick={confirmer}
        >
          Adapter les questions
        </button>
      </div>
    </dialog>
  );
}

function ConfigurateurContraintes({
  configuration,
  invalide,
  occupe,
  sessionReelle,
  modeLong,
  libelleSoumission,
  changer,
  soumettre,
  passerEnCourt,
}: {
  configuration: ConfigurationContraintes;
  invalide: boolean;
  occupe: boolean;
  sessionReelle: boolean;
  modeLong: boolean;
  libelleSoumission: string;
  changer: (champ: keyof ConfigurationContraintes, valeur: string) => void;
  soumettre: () => void;
  passerEnCourt: () => void;
}) {
  return (
    <>
      <div className="card contraintes-config">
        <div className="contraintes-config__intro">
          <p className="lbl contraintes-config__kicker">Les trois données de base</p>
          <p className="contraintes-config__texte">
            Si une réponse n’est pas encore fixée, écrivez « à définir ». Si aucune
            technologie n’est imposée, écrivez « aucune ».
          </p>
        </div>

        <div className="contraintes-config__grille">
          <label className="contraintes-config__champ" htmlFor="contrainte-delai">
            <span className="contraintes-config__label">Délai ou échéance</span>
            <input
              id="contrainte-delai"
              type="text"
              className="contraintes-config__input"
              maxLength={600}
              value={configuration.delai}
              onChange={(event) => changer('delai', event.target.value)}
              placeholder="Ex. Avant le 15 septembre, ou à définir"
            />
            <span className="contraintes-config__aide">
              Date imposée, période souhaitée ou absence d’échéance.
            </span>
          </label>

          <label className="contraintes-config__champ" htmlFor="contrainte-budget">
            <span className="contraintes-config__label">Budget disponible</span>
            <input
              id="contrainte-budget"
              type="text"
              className="contraintes-config__input"
              maxLength={600}
              value={configuration.budget}
              onChange={(event) => changer('budget', event.target.value)}
              placeholder="Ex. 8 000 à 12 000 €, ou à définir"
            />
            <span className="contraintes-config__aide">
              Une enveloppe, une fourchette ou « à discuter de vive voix ».
            </span>
          </label>

          <label
            className="contraintes-config__champ contraintes-config__champ--large"
            htmlFor="contrainte-technologies"
          >
            <span className="contraintes-config__label">
              Demandes technologiques spécifiques
            </span>
            <input
              id="contrainte-technologies"
              type="text"
              className="contraintes-config__input"
              maxLength={600}
              value={configuration.technologies}
              onChange={(event) => changer('technologies', event.target.value)}
              placeholder="Ex. WordPress imposé, connexion à Abby, ou aucune"
            />
            <span className="contraintes-config__aide">
              Technologie, logiciel, hébergeur, appareil ou intégration déjà imposés.
            </span>
          </label>
        </div>

        <div className="answer__actions contraintes-config__actions">
          <span className="note contraintes-config__etat">
            {invalide
              ? 'Les trois champs doivent être renseignés'
              : 'Prêt pour la recherche des autres contraintes'}
          </span>
          <button
            type="button"
            className="btn btn--primary answer__submit"
            onClick={soumettre}
            disabled={occupe || invalide}
          >
            {occupe ? 'J’analyse vos contraintes…' : libelleSoumission}
          </button>
        </div>
      </div>

      <div className="answer__footer">
        <p className="note answer__saved">
          {sessionReelle
            ? 'Enregistrement automatique · fermez cette page, le lien vous ramènera ici'
            : "Démonstration — rien n'est enregistré sur cet écran"}
        </p>
        {modeLong && (
          <button type="button" className="btn--accent" onClick={passerEnCourt}>
            Aller plus vite : version courte
          </button>
        )}
      </div>
    </>
  );
}

export function Entretien() {
  const { state, dispatch, entretien } = useCadrage();
  const questionRef = useRef<HTMLDivElement>(null);
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);
  const index = currentIndex(state);
  const point = POINTS[index];
  const pointsVisibles = indicesPointsVisibles(state);
  const precedente = questionPrecedente(state);
  const suivante = questionSuivante(state);
  const echange = echangeCourant(state, index);
  const historique = Boolean(echange?.reponse.trim());
  const reponseOriginale = echange?.reponse.trim() ?? '';
  const reponseModifiee = historique && state.draft.trim() !== reponseOriginale;
  const reponsesInvalidees = historique
    ? (state.echanges[index] ?? [])
        .slice(state.rang + 1)
        .filter((item) => item.reponse.trim()).length
    : 0;
  const libelleCorrection = !reponseModifiee
    ? suivante
      ? 'Revenir à la question suivante'
      : 'Réponse inchangée'
    : reponsesInvalidees > 0
      ? 'Enregistrer et adapter la suite'
      : 'Enregistrer la correction';

  // Une relance remplace la question au même endroit. On l'accompagne d'un
  // défilement doux vers ce bloc, plutôt que de renvoyer brutalement en haut.
  useEffect(() => {
    if (state.rang === 0) return;
    const animationReduite = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = window.requestAnimationFrame(() => {
      questionRef.current?.scrollIntoView({
        behavior: animationReduite ? 'auto' : 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [index, state.rang]);

  const isDone = (k: number) => state.answers[k] !== undefined;

  const draft = state.draft.trim();

  // Le contenu écrit pour CE client, celui de la maquette sinon : l'entretien
  // ne s'arrête jamais faute de modèle. Sur un dossier réel, on attend plutôt
  // que d'afficher les réponses probables d'un autre métier.
  const ouverture = ouvertureOf(state, index);
  const multiple = ouverture.choix === 'multiple';
  const lignes = state.draft.split('\n').filter((l) => l.trim());
  const configurateurContraintes =
    state.rang === 0 && point.configurateur === 'contraintes';
  // Sur un dossier réel, tant que le point n'est pas écrit pour ce client, on
  // n'affiche ni question ni réponses : la formulation de référence est un
  // repli de panne, pas un écran d'attente.
  const enAttente =
    Boolean(state.session) &&
    !configurateurContraintes &&
    !questionConnue(state, index);
  // Dernière barrière contre une ancienne génération en cache ou une réponse
  // d'API dégradée : une carte de ponctuation seule ne doit jamais atteindre
  // l'écran, ni pouvoir devenir la réponse du client.
  const propositions = [
    ...new Set(
      ouverture.propositions
        .filter((proposition): proposition is string => typeof proposition === 'string')
        .map((proposition) => proposition.trim())
        .filter((proposition) => proposition.length >= 2 && /[\p{L}\p{N}]/u.test(proposition)),
    ),
  ];
  const selection = state.rang === 0 ? point.selection : undefined;
  const selectionInvalide = Boolean(
    selection && (lignes.length < selection.min || lignes.length > selection.max),
  );
  const contraintes = lireContraintes(state.draft);
  const contraintesInvalides =
    configurateurContraintes &&
    Object.values(contraintes).some((valeur) => !valeur.trim());

  const changerContrainte = (
    champ: keyof ConfigurationContraintes,
    valeur: string,
  ) => {
    dispatch({
      type: 'setDraft',
      value: serialiserContraintes({ ...contraintes, [champ]: valeur }),
    });
  };

  const soumettre = () => {
    if (historique && !reponseModifiee) {
      if (suivante) {
        dispatch({
          type: 'goQuestion',
          point: suivante.point,
          rang: suivante.rang,
        });
      }
      return;
    }

    if (reponseModifiee && reponsesInvalidees > 0) {
      setConfirmationOuverte(true);
      return;
    }

    void entretien.soumettre();
  };

  // Même règle pour l'aide : sur un dossier réel, on n'affiche pas les pistes
  // d'un autre métier en attendant celles de ce client.
  const aide = state.aide[index] ?? {
    titre: point.help.title,
    pistes: point.help.items.map((h) => ({ texte: h.text, effet: h.effect })),
  };
  const aideEnAttente = Boolean(state.session) && !state.aide[index];

  return (
    <div>
      <AppHeader
        mode={`Cadrage — ${state.session?.client.nom ?? 'Camille Dorval'}${
          state.mode === 'court' ? ' · version courte' : ''
        }`}
        sticky
        truncate
        saved
      />

      <main className="entretien__main">
        <nav aria-label="Les points du cadrage" className="rail">
          <p className="lbl rail__title">Le dossier</p>
          <ol className="rail__list">
            {pointsVisibles.map((k) => {
              const p = POINTS[k];
              return <li key={p.num} className="rail__item">
                <span className={k === index ? 'rail__num rail__num--current' : 'rail__num'}>
                  {p.num}
                </span>
                <button
                  type="button"
                  className={
                    k === index
                      ? 'rail__jump rail__jump--current'
                      : isDone(k)
                        ? 'rail__jump rail__jump--done'
                        : 'rail__jump'
                  }
                  onClick={() => dispatch({ type: 'goStep', step: k })}
                >
                  {p.label}
                </button>
              </li>;
            })}
          </ol>
        </nav>

        <section className="entretien__col">
          <div className="progress">
            <span className="progress__label">
              Point {point.num} · {point.label}
            </span>
            <div className="progress__bars" aria-hidden="true">
              {pointsVisibles.map((k) => {
                const p = POINTS[k];
                return <span
                  key={p.num}
                  className={
                    k === index
                      ? 'progress__bar progress__bar--current'
                      : isDone(k)
                        ? 'progress__bar progress__bar--done'
                        : 'progress__bar'
                  }
                />;
              })}
            </div>
          </div>

          {state.tension && (
            <div className="tension">
              <p className="lbl tension__label">À éclaircir avant d'avancer</p>
              <p className="tension__text">
                {state.tensionCourante?.explication ?? MAQUETTE_TENSION.explication}
              </p>
              <div className="tension__actions">
                <button
                  type="button"
                  className="btn btn--soft tension__btn"
                  onClick={() => void entretien.trancher('bascule')}
                >
                  {state.tensionCourante?.optionA ?? MAQUETTE_TENSION.optionA}
                </button>
                <button
                  type="button"
                  className="btn btn--soft tension__btn"
                  onClick={() => void entretien.trancher('maintien')}
                >
                  {state.tensionCourante?.optionB ?? MAQUETTE_TENSION.optionB}
                </button>
                <button
                  type="button"
                  className="btn btn--underline tension__btn"
                  onClick={() => void entretien.trancher('maintien')}
                >
                  Les deux, j'explique
                </button>
              </div>
            </div>
          )}

          <div
            key={`${index}:${state.rang}`}
            ref={questionRef}
            className="question-turn"
          >
            {precedente && (
              <div className="question-nav" aria-label="Navigation entre les questions">
                <button
                  type="button"
                  className="question-nav__previous"
                  onClick={() =>
                    dispatch({
                      type: 'goQuestion',
                      point: precedente.point,
                      rang: precedente.rang,
                    })
                  }
                  disabled={state.occupe}
                >
                  <span aria-hidden="true">←</span> Question précédente
                </button>
              </div>
            )}
            <div className="question" aria-live="polite">
              <p className="lbl question__header">
                {configurateurContraintes
                  ? 'Configuration initiale · trois champs'
                  : historique
                    ? `Question ${state.rang + 1} · réponse enregistrée`
                    : `Question ${state.rang + 1}${
                        state.rang === 0 && questionsMinimales(point) > 1
                          ? ` · ${questionsMinimales(point)} temps prévus`
                          : state.rang > 0
                            ? ' · précision ciblée'
                            : ''
                      }`}
              </p>
              {/* Rien ne s'affiche à la place de la question tant qu'elle n'est
                  pas écrite : lire une question, commencer à y penser, et la voir
                  remplacée par une autre est pire que d'attendre. */}
              {enAttente ? (
                <Attente
                  texte="J'écris la question pour votre métier…"
                  duree={5}
                  note="Quelques secondes. Les points suivants s'ouvriront sans attendre."
                />
              ) : (
                <>
                  <h1 className="serif question__title">{ouverture.question}</h1>
                  {state.mode !== 'court' && <p className="question__hint">{ouverture.relance}</p>}
                </>
              )}
            </div>

            {!state.help && !enAttente && (
              <div>
              {configurateurContraintes ? (
                <ConfigurateurContraintes
                  configuration={contraintes}
                  invalide={contraintesInvalides}
                  occupe={state.occupe}
                  sessionReelle={Boolean(state.session)}
                  modeLong={state.mode === 'long'}
                  libelleSoumission={historique ? libelleCorrection : 'Continuer avec l’IA'}
                  changer={changerContrainte}
                  soumettre={soumettre}
                  passerEnCourt={() => dispatch({ type: 'switchCourt' })}
                />
              ) : (
              <>
              {propositions.length > 0 && (
              <div className="props">
                <p className="lbl props__label">
                  {selection
                    ? `${lignes.length}/${selection.max} sélectionnés — choisissez exactement ${selection.max} éléments`
                    : multiple
                    ? 'Cliquez tout ce qui vous concerne — plusieurs réponses possibles'
                    : 'Réponses probables — cliquez, puis corrigez à votre main'}
                </p>
                <div className="props__list">
                  {propositions.map((text) => {
                    const prise = multiple ? lignes.includes(text) : draft === text;
                    return (
                      <button
                        key={text}
                        type="button"
                        aria-pressed={multiple ? prise : undefined}
                        className={prise ? 'prop prop--picked' : 'prop'}
                        disabled={Boolean(
                          selection && lignes.length >= selection.max && !prise,
                        )}
                        onClick={() => dispatch({ type: 'pickProp', text })}
                      >
                        {multiple && (
                          <span className="prop__marque" aria-hidden="true">
                            {prise ? '×' : '+'}
                          </span>
                        )}
                        {text}
                      </button>
                    );
                  })}
                </div>
              </div>
              )}

              <div className="card">
                <label htmlFor="rep" className="answer__label">
                  {selection
                    ? 'Vos trois éléments — un par ligne, modifiables à volonté'
                    : 'Votre réponse — modifiable à volonté'}
                </label>
                <textarea
                  id="rep"
                  rows={6}
                  maxLength={20_000}
                  className="answer__input"
                  value={state.draft}
                  onChange={(e) => dispatch({ type: 'setDraft', value: e.target.value })}
                  placeholder={
                    selection
                      ? 'Écrivez exactement trois éléments, un par ligne.'
                      : 'Écrivez comme vous le raconteriez de vive voix.'
                  }
                />
                <div className="answer__actions">
                  <button
                    type="button"
                    className="btn btn--outline answer__help-btn"
                    onClick={() => dispatch({ type: 'openHelp' })}
                  >
                    Je ne sais pas, aidez-moi
                  </button>
                  {/* Dès la deuxième question d'un point, le client peut
                      décider lui-même que le point est assez précis. */}
                  {state.rang > 0 && !historique && (
                    <button
                      type="button"
                      className="btn btn--outline answer__clore"
                      onClick={() => void entretien.clore()}
                      disabled={state.occupe}
                    >
                      {index >= LAST
                        ? 'Terminer l’entretien'
                        : 'Passer à l’étape suivante'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--primary answer__submit"
                    onClick={soumettre}
                    disabled={
                      state.occupe ||
                      selectionInvalide ||
                      (historique && !reponseModifiee && !suivante)
                    }
                  >
                    {state.occupe
                      ? 'J’analyse votre réponse…'
                      : selectionInvalide
                        ? `${lignes.length}/${selection?.max ?? 3} éléments sélectionnés`
                      : historique
                        ? libelleCorrection
                        : 'Continuer'}
                  </button>
                </div>
              </div>

              <div className="answer__footer">
                <p className="note answer__saved">
                  {state.session
                    ? 'Enregistrement automatique · fermez cette page, le lien vous ramènera ici'
                    : "Démonstration — rien n'est enregistré sur cet écran"}
                </p>
                {state.mode === 'long' && (
                  <button
                    type="button"
                    className="btn--accent"
                    onClick={() => dispatch({ type: 'switchCourt' })}
                  >
                    Aller plus vite : version courte
                  </button>
                )}
              </div>
              </>
              )}
              </div>
            )}

            {entretien.erreur && (
              <p className="rapide__erreur" role="alert">
                {entretien.erreur} Votre brouillon est conservé.
              </p>
            )}

            {state.help && (
              <div className="help">
              <div className="help__head">
                <p className="lbl help__head-label">Annexe — aide sur le point {point.num}</p>
                <button
                  type="button"
                  className="help__close"
                  onClick={() => dispatch({ type: 'closeHelp' })}
                >
                  Fermer
                </button>
              </div>

              {aideEnAttente ? (
                <Attente texte="J'écris trois pistes pour votre métier…" duree={4} />
              ) : (
                <div className="help__intro">
                  <h2 className="serif help__title">{aide.titre}</h2>
                  <p className="help__body">
                    Prenez celle qui ressemble le plus à votre situation : je l'écris pour vous,
                    vous corrigez ensuite. Chaque piste a une conséquence sur le projet, je vous la
                    dis tout de suite.
                  </p>
                </div>
              )}

              <div className="help__list">
                {!aideEnAttente && aide.pistes.map((piste) => (
                  <button
                    key={piste.texte}
                    type="button"
                    className="help__item help__item--divided"
                    onClick={() => dispatch({ type: 'pickHelp', text: piste.texte })}
                  >
                    <span className="help__item-text">{piste.texte}</span>
                    <span className="help__item-effect">{piste.effet}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="help__item"
                  onClick={() => dispatch({ type: 'closeHelp' })}
                >
                  <span className="help__item-text">
                    Aucune de celles-ci — je vous raconte à ma façon.
                  </span>
                </button>
              </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <ConfirmationCorrection
        ouverte={confirmationOuverte}
        nombre={reponsesInvalidees}
        annuler={() => setConfirmationOuverte(false)}
        confirmer={() => {
          setConfirmationOuverte(false);
          void entretien.soumettre();
        }}
      />
    </div>
  );
}
