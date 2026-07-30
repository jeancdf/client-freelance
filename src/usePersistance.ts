import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatchSession, SauvegardeUrgente } from '../shared/api';
import * as api from './lib/api';
import type { State } from './state';

/** Ce qu'affiche le témoin d'enregistrement dans l'en-tête. */
export type EtatEnregistrement = 'inactif' | 'enregistre' | 'enregistrement' | 'erreur';

const REPOS_MS = 500;
const NOUVEL_ESSAI_MS = 5_000;

interface Instantane {
  mode: string;
  voie: string;
  step: number;
  rang: number;
  draft: string;
  brief: string;
  lien1: string;
  lien2: string;
  reponses: Record<number, string>;
}

function instantane(state: State): Instantane {
  const reponses: Record<number, string> = {};
  for (const cle of Object.keys(state.answers)) {
    const index = Number(cle);
    reponses[index] = JSON.stringify({
      confirme: Boolean(state.confirmed[index]),
      arbitre: Boolean(state.tensionResolved[index]),
      arbitrage: state.arbitrages[index] ?? null,
      deductionConfirmee: Boolean(state.deductionsConfirmed[index]),
    });
  }
  return {
    mode: state.mode,
    voie: state.voie,
    step: state.step,
    rang: state.rang,
    draft: state.draft,
    brief: state.brief,
    lien1: state.lien1,
    lien2: state.lien2,
    reponses,
  };
}

const CHAMPS = ['mode', 'voie', 'step', 'rang', 'draft', 'brief', 'lien1', 'lien2'] as const;

function changements(cible: Instantane, base: Instantane): SauvegardeUrgente {
  const patch: Record<string, unknown> = {};
  for (const champ of CHAMPS) {
    if (cible[champ] !== base[champ]) patch[champ] = cible[champ];
  }

  const reponses = Object.entries(cible.reponses)
    .filter(([index, signature]) => base.reponses[Number(index)] !== signature)
    .map(([index, signature]) => {
      const drapeaux = JSON.parse(signature) as Omit<
        SauvegardeUrgente['reponses'][number],
        'point'
      >;
      return { point: Number(index), ...drapeaux };
    });

  return { patch: patch as PatchSession, reponses };
}

function estVide(envoi: SauvegardeUrgente): boolean {
  return Object.keys(envoi.patch).length === 0 && envoi.reponses.length === 0;
}

/**
 * Sérialise les écritures de fond. Chaque tour relit l'état React le plus
 * récent : une modification arrivée pendant une requête repart dans le tour
 * suivant au lieu d'être comparée à une ancienne fermeture JavaScript.
 */
export function usePersistance(state: State): EtatEnregistrement {
  const token = state.session?.token ?? null;
  const [etat, setEtat] = useState<EtatEnregistrement>('inactif');

  const dernier = useRef(state);
  dernier.current = state;
  const tokenCourant = useRef<string | null>(null);
  const ecrit = useRef<Instantane | null>(null);
  const enVol = useRef(false);
  const aRefaire = useRef(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dernierEnvoiUrgent = useRef('');

  const annulerMinuteur = useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
  }, []);

  const pousser = useCallback(async (): Promise<void> => {
    const jeton = tokenCourant.current;
    if (!jeton || !ecrit.current) return;
    if (enVol.current) {
      aRefaire.current = true;
      return;
    }

    annulerMinuteur();
    enVol.current = true;
    setEtat('enregistrement');
    try {
      do {
        aRefaire.current = false;
        const cible = instantane(dernier.current);
        const envoi = changements(cible, ecrit.current);
        if (estVide(envoi)) break;

        for (const reponse of envoi.reponses) {
          await api.marquerReponse(jeton, reponse.point, {
            confirme: reponse.confirme,
            arbitre: reponse.arbitre,
            arbitrage: reponse.arbitrage,
            deductionConfirmee: reponse.deductionConfirmee,
          });
        }
        if (Object.keys(envoi.patch).length) await api.patcher(jeton, envoi.patch);

        if (tokenCourant.current !== jeton) return;
        ecrit.current = cible;
      } while (
        aRefaire.current ||
        !estVide(changements(instantane(dernier.current), ecrit.current))
      );
      setEtat('enregistre');
    } catch {
      setEtat('erreur');
      annulerMinuteur();
      minuteur.current = setTimeout(() => void pousser(), NOUVEL_ESSAI_MS);
    } finally {
      enVol.current = false;
      if (aRefaire.current && tokenCourant.current === jeton) {
        annulerMinuteur();
        minuteur.current = setTimeout(() => void pousser(), 0);
      }
    }
  }, [annulerMinuteur]);

  const programmer = useCallback(
    (delai = REPOS_MS) => {
      annulerMinuteur();
      minuteur.current = setTimeout(() => void pousser(), delai);
    },
    [annulerMinuteur, pousser],
  );

  useEffect(() => {
    tokenCourant.current = token;
    ecrit.current = token ? instantane(state) : null;
    aRefaire.current = false;
    dernierEnvoiUrgent.current = '';
    annulerMinuteur();
    setEtat(token ? 'enregistre' : 'inactif');
  }, [token, annulerMinuteur]);

  useEffect(() => {
    if (!token || !ecrit.current) return;
    const envoi = changements(instantane(state), ecrit.current);
    if (!estVide(envoi)) programmer();
  }, [token, state, programmer]);

  useEffect(() => {
    const envoyer = () => {
      const jeton = tokenCourant.current;
      if (!jeton || !ecrit.current) return;
      const envoi = changements(instantane(dernier.current), ecrit.current);
      if (estVide(envoi)) return;
      const signature = JSON.stringify(envoi);
      if (signature === dernierEnvoiUrgent.current) return;
      dernierEnvoiUrgent.current = signature;
      api.sauvegarderAvantFermeture(jeton, envoi);
    };
    const siMasque = () => {
      if (document.visibilityState === 'hidden') envoyer();
    };

    window.addEventListener('pagehide', envoyer);
    document.addEventListener('visibilitychange', siMasque);
    return () => {
      window.removeEventListener('pagehide', envoyer);
      document.removeEventListener('visibilitychange', siMasque);
    };
  }, []);

  useEffect(() => () => annulerMinuteur(), [annulerMinuteur]);

  return etat;
}
