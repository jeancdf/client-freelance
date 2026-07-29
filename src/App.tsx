import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ComponentType,
} from 'react';
import { CadrageProvider } from './CadrageContext';
import { applyAccent, applyThemePref, toggleTheme, type ThemePref } from './lib/theme';
import * as api from './lib/api';
import { estDemo, estInscription, estPrestataire, jetonDuLien } from './lib/lien';
import { initialState, reducer, type Screen } from './state';
import { usePersistance } from './usePersistance';
import { useEntretien } from './useEntretien';
import { PlanNav } from './components/PlanNav';
import { Landing } from './screens/Landing';
import { Inscription } from './screens/Inscription';
import { Accueil } from './screens/Accueil';
import { Depart } from './screens/Depart';
import { Reprise } from './screens/Reprise';
import { Entretien } from './screens/Entretien';
import { Reformulation } from './screens/Reformulation';
import { Rapide } from './screens/Rapide';
import { Recap } from './screens/Recap';
import { Fin } from './screens/Fin';
import { Dashboard } from './screens/Dashboard';
import { Deroule } from './screens/Deroule';

export interface CadrageProps {
  /** Thème imposé au chargement ; `auto` suit le réglage du système. */
  theme?: ThemePref;
  /** Couleur d'accent de la marque. */
  accent?: string;
  /** Sélecteur d'écrans, pour la démonstration. Réservé à `/demo` : ailleurs il
   *  donne accès à des écrans qui ne sont pas ceux du visiteur. */
  afficherPlan?: boolean;
}

const SCREENS: Record<Screen, ComponentType> = {
  landing: Landing,
  inscription: Inscription,
  accueil: Accueil,
  depart: Depart,
  reprise: Reprise,
  entretien: Entretien,
  reform: Reformulation,
  rapide: Rapide,
  recap: Recap,
  fin: Fin,
  dash: Dashboard,
  deroule: Deroule,
};

type Chargement = 'demonstration' | 'chargement' | 'pret' | 'introuvable';

export function Cadrage({ theme = 'auto', accent, afficherPlan = true }: CadrageProps) {
  const token = useMemo(() => jetonDuLien(), []);
  const demo = useMemo(() => estDemo(), []);
  // Sans lien : `/demo` montre la maquette, `/prestataire` le tableau de bord,
  // et tout le reste la page publique. Un visiteur qui arrive de nulle part ne
  // doit jamais tomber sur le dossier d'un client de démonstration.
  const [state, dispatch] = useReducer(reducer, initialState, (depart) => {
    if (token || demo) return depart;
    const screen = estPrestataire()
      ? 'dash'
      : estInscription()
        ? 'inscription'
        : 'landing';
    return { ...depart, screen: screen as Screen };
  });
  const [chargement, setChargement] = useState<Chargement>(
    token ? 'chargement' : 'demonstration',
  );

  // Le thème vit sur `<html>`, hors de React : ce compteur sert seulement à
  // redemander le calcul de l'accent quand le thème effectif a changé.
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    applyThemePref(theme);
    setThemeTick((tick) => tick + 1);
  }, [theme]);

  useEffect(() => {
    applyAccent(accent);
  }, [accent, themeTick]);

  // En `auto`, suivre le système : l'accent doit être recalculé avec lui.
  useEffect(() => {
    if (theme !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setThemeTick((tick) => tick + 1);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    if (!token) return;
    let annule = false;

    api
      .lireSession(token)
      .then((session) => {
        if (annule) return;
        dispatch({ type: 'hydrate', token, session });
        setChargement('pret');
      })
      .catch(() => {
        if (!annule) setChargement('introuvable');
      });

    return () => {
      annule = true;
    };
  }, [token]);

  const enregistrement = usePersistance(state);
  const entretien = useEntretien(state, dispatch);

  // Chaque changement d'écran ou de point ramène en haut : on lit une page à
  // la fois, jamais le milieu de la suivante.
  useEffect(() => {
    if (state.scrollTick === 0) return;
    window.scrollTo(0, 0);
  }, [state.scrollTick]);

  const onToggleTheme = useCallback(() => {
    toggleTheme();
    setThemeTick((tick) => tick + 1);
  }, []);

  const value = useMemo(
    () => ({ state, dispatch, onToggleTheme, enregistrement, entretien }),
    [state, onToggleTheme, enregistrement, entretien],
  );

  if (chargement === 'chargement') return <Attente />;
  if (chargement === 'introuvable') return <LienInvalide />;

  const Screen = SCREENS[state.screen];

  return (
    <CadrageProvider value={value}>
      <div className="app">
        <Screen />
        {afficherPlan && demo && !state.session && <PlanNav />}
      </div>
    </CadrageProvider>
  );
}

function Attente() {
  return (
    <div className="app">
      <main className="etat-simple">
        <p className="lbl etat-simple__kicker">Cadrage</p>
        <p className="etat-simple__texte">Nous retrouvons votre dossier…</p>
      </main>
    </div>
  );
}

function LienInvalide() {
  return (
    <div className="app">
      <main className="etat-simple">
        <p className="lbl etat-simple__kicker">Lien introuvable</p>
        <h1 className="serif etat-simple__titre">Ce lien ne correspond à aucun cadrage.</h1>
        <p className="etat-simple__texte">
          Il a peut-être été remplacé depuis. Vous pouvez{' '}
          <a href="/">en ouvrir un nouveau</a>, ou écrire à{' '}
          <a href="mailto:nicolas@studiocazals.fr">nicolas@studiocazals.fr</a>.
        </p>
      </main>
    </div>
  );
}
