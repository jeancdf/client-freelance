import { useCadrage } from '../CadrageContext';
import { dateCourte, heure } from '../lib/dates';

export function Fin() {
  const { state, dispatch } = useCadrage();
  const session = state.session;

  const transmis =
    session?.valideLe !== undefined && session?.valideLe !== null
      ? `Cadrage transmis · ${dateCourte(session.valideLe)}, ${heure(session.valideLe)}`
      : 'Cadrage transmis · 12 mars, 21 h 06';

  return (
    <main className="fin">
      <div className="fin__body">
        <p className="lbl fin__kicker">{transmis}</p>
        <h1 className="serif fin__title">C'est noté. Nicolas a votre dossier.</h1>
        <p className="fin__lead">
          Il le retrouve maintenant dans son tableau de suivi et peut le lire avant votre
          rendez-vous.
        </p>
        <p className="fin__lead fin__lead--last">
          Gardez ce lien pour relire votre dossier. Si vous le modifiez, il repassera en cours et
          devra être validé de nouveau avant le chiffrage.
        </p>
        <div className="fin__actions">
          <button
            type="button"
            className="btn btn--outline fin__btn"
            onClick={() => dispatch({ type: 'goRecap' })}
          >
            Relire mon dossier
          </button>
        </div>
      </div>
    </main>
  );
}
