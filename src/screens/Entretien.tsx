import { useCadrage } from '../CadrageContext';
import { AppHeader } from '../components/Headers';
import { POINTS } from '../../shared/points';
import { answerOf, currentIndex } from '../state';

const LAST = POINTS.length - 1;

export function Entretien() {
  const { state, dispatch, entretien } = useCadrage();
  const index = currentIndex(state);
  const point = POINTS[index];

  const isDone = (k: number) => state.answers[k] !== undefined;

  // Les points déjà écrits, avant celui en cours : le « dossier » consultable.
  const answeredBefore: number[] = [];
  for (let k = 0; k < index; k++) if (isDone(k)) answeredBefore.push(k);
  const last = answeredBefore.length ? answeredBefore[answeredBefore.length - 1] : null;

  const draft = state.draft.trim();

  // Le contenu généré pour CE client quand il est arrivé, celui de la maquette
  // sinon : l'entretien ne s'arrête jamais faute de modèle.
  // Sur un dossier réel, on n'affiche rien tant que les propositions ajustées
  // ne sont pas là : mieux vaut un champ vide que les réponses d'un autre métier.
  const propositions = state.propositions[index] ?? (state.session ? [] : point.props);
  const aide = state.aide[index] ?? {
    titre: point.help.title,
    pistes: point.help.items.map((h) => ({ texte: h.text, effet: h.effect })),
  };
  const enAttenteDesPropositions = Boolean(state.session) && !state.propositions[index];

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
        <nav aria-label="Les huit points du cadrage" className="rail">
          <p className="lbl rail__title">Le dossier</p>
          <ol className="rail__list">
            {POINTS.map((p, k) => (
              <li key={p.num} className="rail__item">
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
              </li>
            ))}
          </ol>
        </nav>

        <section className="entretien__col">
          <div className="progress">
            <span className="progress__label">
              Point {point.num} · {point.label}
            </span>
            <div className="progress__bars" aria-hidden="true">
              {POINTS.map((p, k) => (
                <span
                  key={p.num}
                  className={
                    k === index
                      ? 'progress__bar progress__bar--current'
                      : isDone(k)
                        ? 'progress__bar progress__bar--done'
                        : 'progress__bar'
                  }
                />
              ))}
            </div>
          </div>

          {state.tension && (
            <div className="tension">
              <p className="lbl tension__label">À éclaircir avant d'avancer</p>
              <p className="tension__text">
                {state.tensionCourante?.explication ??
                  "Vous m'avez dit que vos clients ne sont pas à l'aise avec les applications. Là, vous mettez au cœur du projet la saisie des charges à chaque série, par eux. Les deux peuvent tenir, mais il faut savoir ce qui compte le plus — ça change ce qu'on construit."}
              </p>
              <div className="tension__actions">
                <button
                  type="button"
                  className="btn btn--soft tension__btn"
                  onClick={() => void entretien.trancher('bascule')}
                >
                  {state.tensionCourante?.optionA ?? "La simplicité passe d'abord"}
                </button>
                <button
                  type="button"
                  className="btn btn--soft tension__btn"
                  onClick={() => void entretien.trancher('maintien')}
                >
                  {state.tensionCourante?.optionB ?? 'Le suivi des charges passe d\'abord'}
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

          {last !== null && (
            <div className="prev">
              <p className="lbl prev__label">
                {POINTS[last].num} — {POINTS[last].label} · vos mots
              </p>
              <p className="quote prev__quote">« {answerOf(state, last)} »</p>
              <button
                type="button"
                className="btn--accent"
                onClick={() => dispatch({ type: 'toggleDossier' })}
              >
                Relire le dossier — {answeredBefore.length}{' '}
                {answeredBefore.length > 1 ? 'points écrits' : 'point écrit'}
              </button>

              {state.dossierOpen && (
                <div className="prev__dossier">
                  {answeredBefore.map((k) => (
                    <div key={POINTS[k].num}>
                      <p className="lbl prev__label">
                        {POINTS[k].num} — {POINTS[k].label} · vos mots
                      </p>
                      <p className="quote prev__quote">« {answerOf(state, k)} »</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="question">
            <p className="lbl question__header">
              Point {point.num} — {point.label}
            </p>
            <h1 className="serif question__title">{point.q}</h1>
            {state.mode !== 'court' && <p className="question__hint">{point.hint}</p>}
          </div>

          {!state.help && (
            <div>
              <div className="props">
                <p className="lbl props__label">
                  {propositions.length > 3
                    ? 'Quatre réponses probables — cliquez, puis corrigez à votre main'
                    : 'Réponses probables — cliquez, puis corrigez à votre main'}
                </p>
                <div className="props__list">
                  {enAttenteDesPropositions && (
                    <p className="props__attente">Je prépare des réponses adaptées à votre métier…</p>
                  )}
                  {propositions.map((text) => (
                    <button
                      key={text}
                      type="button"
                      className={draft === text ? 'prop prop--picked' : 'prop'}
                      onClick={() => dispatch({ type: 'pickProp', text })}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card">
                <label htmlFor="rep" className="answer__label">
                  Votre réponse — modifiable à volonté
                </label>
                <textarea
                  id="rep"
                  rows={6}
                  className="answer__input"
                  value={state.draft}
                  onChange={(e) => dispatch({ type: 'setDraft', value: e.target.value })}
                  placeholder="Écrivez comme vous le raconteriez de vive voix."
                />
                <div className="answer__actions">
                  <button
                    type="button"
                    className="btn btn--outline answer__help-btn"
                    onClick={() => dispatch({ type: 'openHelp' })}
                  >
                    Je ne sais pas, aidez-moi
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary answer__submit"
                    onClick={() => void entretien.soumettre()}
                    disabled={state.occupe}
                  >
                    {state.occupe
                      ? 'Je vous lis…'
                      : index >= LAST
                        ? 'Voir le récapitulatif'
                        : 'Continuer'}
                  </button>
                </div>
              </div>

              <div className="answer__footer">
                <p className="note answer__saved">
                  {state.session
                    ? 'Enregistré à chaque mot · fermez cette page, le lien vous ramènera ici'
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
            </div>
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

              <div className="help__intro">
                <h2 className="serif help__title">{aide.titre}</h2>
                <p className="help__body">
                  Prenez celle qui ressemble le plus à votre situation : je l'écris pour vous, vous
                  corrigez ensuite. Chaque piste a une conséquence sur le projet, je vous la dis
                  tout de suite.
                </p>
              </div>

              <div className="help__list">
                {aide.pistes.map((piste) => (
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
        </section>
      </main>
    </div>
  );
}
