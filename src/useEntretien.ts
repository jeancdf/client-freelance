import { useCallback, useEffect, type Dispatch } from 'react';
import { POINTS } from '../shared/points';
import * as api from './lib/api';
import type { Action, State } from './state';
import { currentIndex, ouvertureOf } from './state';

/**
 * Les échanges avec le serveur qui font attendre le client, par opposition à
 * l'enregistrement de fond de `usePersistance`.
 *
 * Le réducteur reste pur : il ne décide de la suite qu'une fois la réponse du
 * serveur reçue, via l'action « suite ».
 */
export interface Entretien {
  /** Valide le point en cours et enchaîne selon ce que le modèle en tire. */
  soumettre: () => Promise<void>;
  /** Accepte la reformulation, puis avance. */
  confirmer: () => Promise<void>;
  /** Tranche la contradiction : bascule sur l'autre priorité, ou maintient. */
  trancher: (choix: 'bascule' | 'maintien') => Promise<void>;
}

export function useEntretien(state: State, dispatch: Dispatch<Action>): Entretien {
  const token = state.session?.token ?? null;
  const index = currentIndex(state);

  // L'ouverture du point en cours : sa question, sa relance et ses réponses
  // probables. Mise en cache côté serveur — revenir sur un point ne regénère
  // rien, et le client y retrouve la question qu'il avait lue.
  useEffect(() => {
    if (!token || state.screen !== 'entretien') return;
    if (state.ouvertures[index]) return;

    let annule = false;

    void (async () => {
      // Un essai, puis un second après une seconde : le cas courant est un
      // serveur qui vient de redémarrer, pas une panne.
      for (let essai = 0; essai < 2 && !annule; essai++) {
        try {
          const r = await api.lireOuverture(token, index);
          if (annule) return;
          dispatch({
            type: 'ouverture',
            point: index,
            ouverture: { question: r.question, relance: r.relance, propositions: r.propositions },
          });
          return;
        } catch {
          if (essai === 0) await new Promise((suite) => setTimeout(suite, 1000));
        }
      }

      // Le serveur ne répond pas. On pose la formulation de référence : le
      // client aura des questions moins ajustées, mais il aura son champ de
      // réponse. L'attendre indéfiniment serait une page morte.
      if (annule) return;
      const point = POINTS[index];
      dispatch({
        type: 'ouverture',
        point: index,
        ouverture: { question: point.q, relance: point.hint, propositions: point.props },
      });
    })();

    return () => {
      annule = true;
    };
  }, [token, index, state.screen, state.ouvertures, dispatch]);

  // Les pistes d'aide, seulement quand le client les demande : c'est l'appel
  // le plus cher et le moins souvent utile.
  useEffect(() => {
    if (!token || !state.help || state.aide[index]) return;

    let annule = false;
    api
      .lireAide(token, index)
      .then((r) => {
        if (!annule) dispatch({ type: 'aide', point: index, aide: { titre: r.titre, pistes: r.pistes } });
      })
      .catch(() => {});

    return () => {
      annule = true;
    };
  }, [token, index, state.help, state.aide, dispatch]);

  const ecrire = useCallback(
    async (texte: string, extra: { confirme?: boolean; arbitre?: boolean } = {}) => {
      if (!token) return;
      const suite = await api.ecrireReponse(token, index, { texte, ...extra });
      dispatch({
        type: 'suite',
        point: index,
        texte: suite.reponse.texte,
        reformulation: suite.reformulation,
        tension: suite.tension,
        deduction: suite.deduction,
      });
    },
    [token, index, dispatch],
  );

  const soumettre = useCallback(async () => {
    const texte = state.draft.trim() || ouvertureOf(state, index).propositions[0] || '';
    if (!token || !texte) {
      dispatch({ type: 'submit' });
      return;
    }

    dispatch({ type: 'submit' });
    try {
      await ecrire(texte);
    } catch {
      // L'écriture a échoué : on rend la main plutôt que de laisser le bouton
      // tourner indéfiniment. `usePersistance` réessaiera en fond.
      dispatch({ type: 'occupe', valeur: false });
    }
  }, [token, index, state, ecrire, dispatch]);

  const confirmer = useCallback(async () => {
    dispatch({ type: 'confirmReform' });
  }, [dispatch]);

  const trancher = useCallback(
    async (choix: 'bascule' | 'maintien') => {
      dispatch({ type: choix === 'bascule' ? 'tensionSimple' : 'tensionKeep' });
    },
    [dispatch],
  );

  return { soumettre, confirmer, trancher };
}
