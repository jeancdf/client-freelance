import { useCadrage } from '../CadrageContext';
import { SiteHeader } from '../components/Headers';

export function Accueil() {
  const { state, dispatch } = useCadrage();
  const nom = state.session?.client.nom ?? 'Camille Dorval';

  return (
    <main className="page">
      <SiteHeader />

      <div className="accueil__grid">
        <div className="accueil__intro">
          <p className="lbl accueil__kicker">Entretien de cadrage · {nom}</p>
          <h1 className="serif accueil__title">
            Avant notre rendez-vous,
            <br />
            prenons quinze minutes pour comprendre votre projet.
          </h1>
          <p className="accueil__lead">
            Vous répondez à une question à la fois, avec vos mots — ou en choisissant parmi les
            réponses que je vous propose. Il n'y a rien à préparer, et « je ne sais pas » est une
            réponse utile.
          </p>
          <p className="accueil__lead accueil__lead--last">
            À la fin, vous relisez ce qui a été noté et vous le validez. C'est ce document qui me
            servira à chiffrer votre projet.
          </p>

          <div className="accueil__actions">
            <button
              type="button"
              className="btn btn--primary accueil__cta"
              onClick={() => dispatch({ type: 'start', mode: 'long' })}
            >
              Commencer l'entretien
            </button>
            <span className="note accueil__meta">15 min environ · aucun compte à créer</span>
          </div>
          <p className="note accueil__resume">
            Vous pouvez vous arrêter à tout moment et reprendre depuis n'importe quel appareil.
          </p>
        </div>

        <aside className="accueil__aside">
          <p className="lbl accueil__aside-kicker">Si vous êtes déjà prêt</p>
          <div className="accueil__paths">
            <div className="accueil__path">
              <h2 className="serif accueil__path-title">Version courte — cinq minutes</h2>
              <p className="accueil__path-body">
                Les mêmes huit points, mais je vais droit au but : une question par point, des
                réponses déjà rédigées à choisir ou à corriger, aucune relance.
              </p>
              <button
                type="button"
                className="btn btn--outline accueil__path-btn"
                onClick={() => dispatch({ type: 'start', mode: 'court' })}
              >
                Passer en version courte
              </button>
            </div>

            <div className="accueil__path">
              <h2 className="serif accueil__path-title">J'ai déjà un cahier des charges</h2>
              <p className="accueil__path-body">
                Déposez le document et vos liens. Je le lis, puis je ne vous demande que ce qui
                manque — quatre minutes.
              </p>
              <button
                type="button"
                className="btn btn--outline accueil__path-btn"
                onClick={() => dispatch({ type: 'goScreen', screen: 'rapide' })}
              >
                Déposer mon document
              </button>
            </div>
          </div>
        </aside>
      </div>

      <footer className="accueil__footer">
        <span>Nicolas Cazals — développement sur mesure</span>
        <span>nicolas@studiocazals.fr</span>
      </footer>
    </main>
  );
}
