import { useCadrage } from '../CadrageContext';
import { currentIndex } from '../state';
import { POINTS } from '../../shared/points';

/**
 * Sélecteur d'écrans. C'est un outil de démonstration, pas une navigation
 * client : il donne accès à des états qu'on ne peut pas atteindre en jouant
 * l'entretien dans l'ordre (reprise, tension, dossier du prestataire).
 */
export function PlanNav() {
  const { state, dispatch } = useCadrage();
  const { screen, planOpen, help, tension } = state;

  const current = (name: string) => (screen === name ? 'page' : undefined);
  const stepNum = POINTS[currentIndex(state)].num;

  const links: Array<{ label: string; current: 'page' | undefined; onClick: () => void }> = [
    { label: '1 Accueil', current: current('accueil'), onClick: () => dispatch({ type: 'goScreen', screen: 'accueil' }) },
    {
      label: `2 Entretien · point ${stepNum}`,
      current: screen === 'entretien' && !help && !tension ? 'page' : undefined,
      onClick: () => dispatch({ type: 'goStep', step: currentIndex(state) }),
    },
    { label: 'Déroulé des 8 points', current: current('deroule'), onClick: () => dispatch({ type: 'goDeroule' }) },
    {
      label: '3 Aide',
      current: screen === 'entretien' && help ? 'page' : undefined,
      onClick: () => dispatch({ type: 'goAide' }),
    },
    { label: '4 Reformulation', current: current('reform'), onClick: () => dispatch({ type: 'goScreen', screen: 'reform' }) },
    { label: '5 Chemin rapide', current: current('rapide'), onClick: () => dispatch({ type: 'goScreen', screen: 'rapide' }) },
    { label: '6 Récapitulatif', current: current('recap'), onClick: () => dispatch({ type: 'goRecap' }) },
    {
      label: 'Tension',
      current: screen === 'entretien' && tension ? 'page' : undefined,
      onClick: () => dispatch({ type: 'goTension' }),
    },
    { label: 'Reprise', current: current('reprise'), onClick: () => dispatch({ type: 'goScreen', screen: 'reprise' }) },
    { label: 'Fin', current: current('fin'), onClick: () => dispatch({ type: 'goScreen', screen: 'fin' }) },
    { label: '7 Prestataire', current: current('dash'), onClick: () => dispatch({ type: 'goScreen', screen: 'dash' }) },
  ];

  return (
    <nav aria-label="Aperçu des écrans" className="plan">
      <button
        type="button"
        className="plan__toggle"
        aria-expanded={planOpen}
        onClick={() => dispatch({ type: 'togglePlan' })}
      >
        Parcours
      </button>

      {planOpen && (
        <div className="plan__list">
          {links.map((link) => (
            <button
              key={link.label}
              type="button"
              data-nav=""
              aria-current={link.current}
              className="plan__link"
              onClick={link.onClick}
            >
              {link.label}
            </button>
          ))}
          <button type="button" className="plan__replay" onClick={() => dispatch({ type: 'replay' })}>
            Rejouer depuis zéro
          </button>
        </div>
      )}
    </nav>
  );
}
