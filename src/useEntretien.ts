import { useCallback, useEffect, type Dispatch } from 'react';
import {
  INDEX_HORS_PERIMETRE,
  INDEX_PERIMETRE,
  POINTS,
} from '../shared/points';
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
  /** Déclare le point complet : pas de question de suite. */
  clore: () => Promise<void>;
}

export function useEntretien(state: State, dispatch: Dispatch<Action>): Entretien {
  const token = state.session?.token ?? null;
  const index = currentIndex(state);

  // L'ouverture du point en cours : sa question, sa relance et ses réponses
  // probables. Mise en cache côté serveur — revenir sur un point ne regénère
  // rien, et le client y retrouve la question qu'il avait lue.
  useEffect(() => {
    if (!token || state.screen !== 'entretien') return;
    // Une question de suite arrive normalement avec la réponse précédente. On
    // ne la redemande que si elle manque ou lui manque ses réponses probables :
    // c'est le cas d'un client qui a rechargé en plein fil.
    const rang = state.rang;
    const connue = state.ouvertures[`${index}:${rang}`];
    if (connue && connue.propositions.length > 0) return;

    let annule = false;

    void (async () => {
      // Un essai, puis un second après une seconde : le cas courant est un
      // serveur qui vient de redémarrer, pas une panne.
      for (let essai = 0; essai < 2 && !annule; essai++) {
        try {
          const r = await api.lireOuverture(token, index, rang);
          if (annule || !r) return;
          dispatch({
            type: 'ouverture',
            point: index,
            rang,
            ouverture: {
              question: r.question,
              relance: r.relance,
              propositions: r.propositions,
              choix: r.choix,
            },
          });
          return;
        } catch {
          if (essai === 0) await new Promise((suite) => setTimeout(suite, 1000));
        }
      }

      // Le serveur ne répond pas. On pose la formulation de référence : le
      // client aura des questions moins ajustées, mais il aura son champ de
      // réponse. L'attendre indéfiniment serait une page morte.
      if (annule || rang > 0) return;
      const point = POINTS[index];
      dispatch({
        type: 'ouverture',
        point: index,
        rang: 0,
        ouverture: {
          question: point.q,
          relance: point.hint,
          propositions: point.props,
          choix: 'unique',
        },
      });
    })();

    return () => {
      annule = true;
    };
  }, [token, index, state.rang, state.screen, state.ouvertures, dispatch]);

  // Les pistes d'aide, seulement quand le client les demande : c'est l'appel
  // le plus cher et le moins souvent utile.
  useEffect(() => {
    if (!token || !state.help || state.aide[index]) return;

    let annule = false;

    void (async () => {
      for (let essai = 0; essai < 2 && !annule; essai++) {
        try {
          const r = await api.lireAide(token, index);
          if (annule) return;
          dispatch({ type: 'aide', point: index, aide: { titre: r.titre, pistes: r.pistes } });
          return;
        } catch {
          if (essai === 0) await new Promise((suite) => setTimeout(suite, 1000));
        }
      }

      // Sans ce repli, l'écran resterait sur son attente : depuis que les
      // pistes de référence ne servent plus de patience, elles doivent servir
      // de panne. Le client a besoin de trois pistes, même moins ajustées.
      if (annule) return;
      const point = POINTS[index];
      dispatch({
        type: 'aide',
        point: index,
        aide: {
          titre: point.help.title,
          pistes: point.help.items.map((piste) => ({ texte: piste.text, effet: piste.effect })),
        },
      });
    })();

    return () => {
      annule = true;
    };
  }, [token, index, state.help, state.aide, dispatch]);

  const ecrire = useCallback(
    async (
      texte: string,
      extra: { confirme?: boolean; arbitre?: boolean; clore?: boolean } = {},
    ) => {
      if (!token) return;
      const rang = state.rang;
      const posee = ouvertureOf(state, index, rang).question;
      const suite = await api.ecrireReponse(token, index, { texte, rang, ...extra });

      const fil = [...(state.echanges[index] ?? []).slice(0, rang), { question: posee, reponse: texte }];

      dispatch({
        type: 'suite',
        point: index,
        texte: suite.reponse.texte,
        question: suite.suite,
        rang: suite.rang,
        echanges: fil,
        reformulation: suite.reformulation,
        tension: suite.tension,
        deduction: suite.deduction,
        horsPerimetre: suite.horsPerimetre,
      });

      // Le point suivant s'écrit pendant que le client lit sa reformulation :
      // c'est le seul moment où il attend déjà quelque chose, et la réponse
      // qu'il vient de donner fait partie du contexte. Inutile tant que le fil
      // de ce point-ci continue — le client n'ira pas au suivant.
      const prochainPoint =
        index === INDEX_PERIMETRE && suite.horsPerimetre?.afficher !== true
          ? INDEX_HORS_PERIMETRE + 1
          : index + 1;
      if (!suite.suite && prochainPoint < POINTS.length) {
        void api
          .lireOuverture(token, prochainPoint)
          .then((r) => {
            if (!r) return;
            dispatch({
              type: 'ouverture',
              point: prochainPoint,
              rang: 0,
              ouverture: {
                question: r.question,
                relance: r.relance,
                propositions: r.propositions,
                choix: r.choix,
              },
            });
          })
          .catch(() => {
            // Sans préchargement, le point suivant se chargera à son ouverture.
          });
      }
    },
    [token, index, state, dispatch],
  );

  const envoyer = useCallback(
    async (extra: { clore?: boolean } = {}) => {
      const texte = state.draft.trim() || ouvertureOf(state, index).propositions[0] || '';
      if (!token || !texte) {
        dispatch({ type: 'submit' });
        return;
      }

      dispatch({ type: 'submit' });
      try {
        await ecrire(texte, extra);
      } catch {
        // L'écriture a échoué : on rend la main plutôt que de laisser le bouton
        // tourner indéfiniment. `usePersistance` réessaiera en fond.
        dispatch({ type: 'occupe', valeur: false });
      }
    },
    [token, index, state, ecrire, dispatch],
  );

  const soumettre = useCallback(() => envoyer(), [envoyer]);
  const clore = useCallback(() => envoyer({ clore: true }), [envoyer]);

  const confirmer = useCallback(async () => {
    dispatch({ type: 'confirmReform' });
  }, [dispatch]);

  const trancher = useCallback(
    async (choix: 'bascule' | 'maintien') => {
      dispatch({ type: choix === 'bascule' ? 'tensionSimple' : 'tensionKeep' });
    },
    [dispatch],
  );

  return { soumettre, confirmer, trancher, clore };
}
