import { useCadrage } from '../CadrageContext';
import { SiteHeader } from '../components/Headers';
import { POINTS, type Point } from '../../shared/points';
import { answerOf, type State } from '../state';

interface Trait {
  kind: string;
  text: string;
  className: string;
}

/**
 * Ce que la machine fait de chaque réponse. L'ordre compte : on montre d'abord
 * ce qui est soumis au client, ensuite seulement ce qui est décidé sans lui.
 */
function traitsOf(point: Point): Trait[] {
  const traits: Trait[] = [];

  if (point.reform) {
    traits.push({
      kind: 'Reformulation soumise avant d’avancer',
      text: `Si je comprends bien : ${point.reform}`,
      className: 'trait trait--reform',
    });
  }

  if (point.tensionOn !== undefined) {
    traits.push({
      kind: 'Tension détectée, arbitrage demandé',
      text: `Si le client retient « ${point.props[point.tensionOn]} », la réponse est confrontée au point II — des clients peu à l’aise avec les applications — et l’entretien s’arrête sur un arbitrage.`,
      className: 'trait trait--tension',
    });
  }

  if (point.deduit) {
    traits.push({
      kind: 'Déduit sans question supplémentaire',
      text: point.deduit,
      className: 'trait',
    });
  }

  if (point.ouvert) {
    traits.push({
      kind: 'Laissé ouvert, signalé comme tel',
      text: point.ouvert,
      className: 'trait',
    });
  }

  if (!traits.length) {
    traits.push({
      kind: 'Consigné tel quel',
      text: 'La réponse part au dossier sans reformulation : elle est déjà factuelle.',
      className: 'trait',
    });
  }

  return traits;
}

function Item({ point, index, state }: { point: Point; index: number; state: State }) {
  const { dispatch } = useCadrage();
  const retenue = answerOf(state, index);

  return (
    <li className="deroule__item">
      <div className="deroule__row">
        <div>
          <p className="deroule__num">{point.num}</p>
          <p className="lbl deroule__label">{point.label}</p>
          <button
            type="button"
            className="deroule__open"
            onClick={() => dispatch({ type: 'goStep', step: index })}
          >
            Ouvrir l'écran
          </button>
        </div>

        <div className="deroule__body">
          <h2 className="serif deroule__q">{point.q}</h2>
          <p className="deroule__hint">{point.hint}</p>

          <div className="deroule__cols">
            <div>
              <p className="lbl deroule__col-label">Réponses probables affichées</p>
              <div className="deroule__props">
                {point.props.map((text) => (
                  <div
                    key={text}
                    className={text === retenue ? 'deroule__prop deroule__prop--kept' : 'deroule__prop'}
                  >
                    <span>{text}</span>
                    <span className="deroule__prop-mark">{text === retenue ? 'Retenue' : ''}</span>
                  </div>
                ))}
              </div>
              <p className="deroule__help-note">
                Champ libre en dessous · {point.help.items.length} pistes chiffrées si le client
                répond « je ne sais pas »
              </p>
            </div>

            <div>
              <p className="lbl deroule__col-label">Traitement</p>
              <div className="deroule__traits">
                {traitsOf(point).map((trait) => (
                  <div key={trait.kind} className={trait.className}>
                    <p className="trait__kind">{trait.kind}</p>
                    <p className="trait__text">{trait.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

/** La vue « coulisses » : à quoi sert chaque question, et ce qu'on en tire. */
export function Deroule() {
  const { state, dispatch } = useCadrage();

  return (
    <main className="page">
      <SiteHeader />

      <div className="deroule__intro">
        <p className="lbl deroule__kicker">Déroulé · sept points systématiques, un conditionnel</p>
        <h1 className="serif deroule__title">Ce que le client voit, et ce que la machine en fait.</h1>
        <p className="deroule__lead">
          Chaque point utile pose au moins deux questions. Le hors-périmètre n'apparaît que si le
          client a lui-même évoqué un besoin supplémentaire. Rien n'est ajouté pour remplir le plan.
        </p>
        <p className="note deroule__case">
          Cas suivi : coach sportif, quarante clients, demande initiale « une appli de fitness ».
        </p>
      </div>

      <ol className="deroule__list">
        {POINTS.map((point, k) => (
          <Item key={point.num} point={point} index={k} state={state} />
        ))}
      </ol>

      <div className="deroule__foot">
        <button
          type="button"
          className="btn btn--primary deroule__replay"
          onClick={() => dispatch({ type: 'start', mode: 'long' })}
        >
          Jouer l'entretien depuis le début
        </button>
        <button
          type="button"
          className="btn btn--outline deroule__dossier"
          onClick={() => dispatch({ type: 'goRecap' })}
        >
          Voir le dossier produit
        </button>
      </div>
    </main>
  );
}
