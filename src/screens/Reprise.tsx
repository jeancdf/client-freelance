import { useCadrage } from '../CadrageContext';
import { SiteHeader } from '../components/Headers';
import { POINTS } from '../../shared/points';
import { answerOf, pointsEcrits, type State } from '../state';
import { depuis } from '../lib/dates';

const RANGS = [
  'premier',
  'deuxième',
  'troisième',
  'quatrième',
  'cinquième',
  'sixième',
  'septième',
  'huitième',
];

/** « Bonjour » ou « Bonsoir » : on écrit à l'heure où le client lit. */
function salutation(maintenant = new Date()): string {
  const h = maintenant.getHours();
  return h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour';
}

function prenom(nomComplet: string): string {
  return nomComplet.trim().split(/\s+/)[0] ?? nomComplet;
}

/** Le texte figé de la maquette, quand on tourne sans dossier réel. */
const DEMO = {
  kicker: 'Reprise · interrompu hier à 21 h 48',
  titre: 'Bonsoir Camille. Tout ce que vous avez écrit est là.',
  lead: 'Nous nous étions arrêtés au troisième point, le fonctionnement actuel. Deux points sont déjà notés, il en reste six.',
  citation:
    "« Mes clients, une quarantaine, entre 30 et 55 ans. Ils ne sont pas très à l'aise avec les applications, il faut que ce soit évident. »",
  action: 'Reprendre au troisième point',
};

function contenu(state: State): typeof DEMO {
  const session = state.session;
  if (!session) return DEMO;

  const ecrits = pointsEcrits(state);
  const reste = POINTS.length - ecrits.length;
  // Le premier point encore vide : c'est là qu'on reprend.
  const reprise = POINTS.findIndex((_, k) => state.answers[k] === undefined);
  const index = reprise === -1 ? POINTS.length - 1 : reprise;
  const dernier = ecrits.length ? ecrits[ecrits.length - 1] : null;

  const notes =
    ecrits.length === 1 ? 'Un point est déjà noté' : `${ecrits.length} points sont déjà notés`;
  const restant = reste === 1 ? 'il en reste un' : `il en reste ${reste}`;

  return {
    kicker: `Reprise · interrompu ${depuis(session.majLe)}`,
    titre: `${salutation()} ${prenom(session.client.nom)}. Tout ce que vous avez écrit est là.`,
    lead: `Nous nous étions arrêtés au ${RANGS[index]} point, ${POINTS[index].label.toLowerCase()}. ${notes}, ${restant}.`,
    citation: dernier === null ? '' : `« ${answerOf(state, dernier)} »`,
    action: `Reprendre au ${RANGS[index]} point`,
  };
}

export function Reprise() {
  const { state, dispatch } = useCadrage();
  const texte = contenu(state);
  const ecrits = pointsEcrits(state);
  const dernier = ecrits.length ? ecrits[ecrits.length - 1] : null;
  const label = state.session && dernier !== null ? POINTS[dernier].label : null;

  return (
    <main className="page">
      <SiteHeader />

      <div className="reprise__body">
        <p className="lbl reprise__kicker">{texte.kicker}</p>
        <h1 className="serif reprise__title">{texte.titre}</h1>
        <p className="reprise__lead">{texte.lead}</p>

        {texte.citation && (
          <div className="reprise__last">
            <p className="lbl reprise__last-label">
              {label ? `${label} — vos mots` : 'Dernière chose écrite — vos mots'}
            </p>
            <p className="quote reprise__last-quote">{texte.citation}</p>
          </div>
        )}

        <div className="reprise__actions">
          <button
            type="button"
            className="btn btn--primary reprise__cta"
            onClick={() => dispatch({ type: 'resumeAt3' })}
          >
            {texte.action}
          </button>
          {ecrits.length > 0 && (
            <button
              type="button"
              className="btn btn--underline reprise__secondary"
              onClick={() => dispatch({ type: 'goRecap' })}
            >
              Relire ce qui est déjà noté
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
