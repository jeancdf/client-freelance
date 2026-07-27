import { useCadrage } from '../CadrageContext';
import { POINTS } from '../../shared/points';
import { currentIndex } from '../state';

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * L'étape qui fait tenir la promesse du document : rien n'entre au dossier sous
 * ma formulation sans que le client l'ait relue et acceptée.
 */
export function Reformulation() {
  const { state, dispatch } = useCadrage();
  const point = POINTS[currentIndex(state)];

  return (
    <main className="reform">
      <div className="reform__body">
        <p className="lbl reform__kicker">
          Point {point.num} — je vérifie avant de passer au suivant
        </p>
        <h1 className="serif reform__title">Si je comprends bien :</h1>
        <p className="reform__text">{capitalise(state.reformulation ?? point.reform ?? '')}</p>
        <p className="reform__caveat">
          C'est ma formulation, pas la vôtre. Si elle est fausse, c'est moi qui corrige.
        </p>

        <div className="reform__actions">
          <button
            type="button"
            className="btn btn--primary reform__confirm"
            onClick={() => dispatch({ type: 'confirmReform' })}
          >
            Oui, c'est ça
          </button>
          <button
            type="button"
            className="btn btn--outline reform__reject"
            onClick={() => dispatch({ type: 'rejectReform' })}
          >
            Pas tout à fait
          </button>
        </div>
      </div>
    </main>
  );
}
