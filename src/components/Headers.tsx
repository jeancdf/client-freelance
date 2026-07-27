import { useCadrage } from '../CadrageContext';

export function ThemeButton({ className = 'btn-theme' }: { className?: string }) {
  const { onToggleTheme } = useCadrage();
  return (
    <button type="button" className={className} onClick={onToggleTheme}>
      Thème
    </button>
  );
}

/** En-tête des écrans « papier » : accueil, reprise, déroulé. */
export function SiteHeader() {
  return (
    <header className="site-head">
      <span className="brand">Studio Cazals</span>
      <ThemeButton />
    </header>
  );
}

const TEMOIN: Record<string, string> = {
  enregistre: 'Enregistré',
  enregistrement: 'Enregistrement…',
  erreur: 'Non enregistré',
  inactif: 'Démonstration',
};

/**
 * Le témoin d'enregistrement. Il dit la vérité : hors session rien n'est
 * écrit, et en cas d'échec réseau le client doit le voir plutôt que de lire
 * « Enregistré » à tort.
 */
function Temoin() {
  const { enregistrement } = useCadrage();
  return (
    <span
      className={
        enregistrement === 'erreur'
          ? 'note app-head__saved app-head__saved--erreur'
          : 'note app-head__saved'
      }
      aria-live="polite"
    >
      {TEMOIN[enregistrement]}
    </span>
  );
}

interface AppHeaderProps {
  /** Le libellé en capitales à côté de la marque. */
  mode: string;
  /** Colle l'en-tête en haut pendant l'entretien, qui défile beaucoup. */
  sticky?: boolean;
  /** Coupe le libellé plutôt que de pousser la bascule de thème hors écran. */
  truncate?: boolean;
  /** Affiche le témoin d'enregistrement (masqué sur mobile, faute de place). */
  saved?: boolean;
}

/** En-tête des écrans « outil » : entretien, dépôt, récapitulatif. */
export function AppHeader({ mode, sticky, truncate, saved }: AppHeaderProps) {
  return (
    <header className={sticky ? 'app-head app-head--sticky' : 'app-head'}>
      <div className="app-head__left">
        <span className="app-head__brand">Studio Cazals</span>
        <span
          className={
            truncate
              ? 'lbl app-head__mode app-head__mode--truncate'
              : 'lbl app-head__mode'
          }
        >
          {mode}
        </span>
      </div>
      <div className="app-head__right">
        {saved && <Temoin />}
        <ThemeButton />
      </div>
    </header>
  );
}
