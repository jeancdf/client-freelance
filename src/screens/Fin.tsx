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
          Il le lit avant votre rendez-vous et arrivera avec un chiffrage et ses questions
          restantes — celles du budget, notamment.
        </p>
        <p className="fin__lead fin__lead--last">
          Vous avez reçu une copie par courriel. Le lien reste ouvert : vous pouvez compléter ou
          corriger jusqu'au rendez-vous.
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
