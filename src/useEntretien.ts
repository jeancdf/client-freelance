import { useCallback, useEffect, useState, type Dispatch } from 'react';
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
  /** Dernière erreur d'écriture, affichée sans effacer le brouillon. */
  erreur: string | null;
}

export function useEntretien(state: State, dispatch: Dispatch<Action>): Entretien {
  const token = state.session?.token ?? null;
  const index = currentIndex(state);
  const [erreur, setErreur] = useState<string | null>(null);

  // L'ouverture du point en cours : sa question, sa relance et ses réponses
  // probables. Mise en cache côté serveur — revenir sur un point ne regénère
  // rien, et le client y retrouve la question qu'il avait lue.
  useEffect(() => {
    if (!token || state.screen !== 'entretien') return;
    // Une question de suite arrive normalement avec la réponse précédente.
    // Une liste de propositions vide est désormais un repli volontaire et
    // neutre, pas un chargement incomplet.
    const rang = state.rang;
    const connue = state.ouvertures[`${index}:${rang}`];
    if (connue) return;

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
          propositions: [],
          choix: point.entretien.propositions.choix,
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

      // Le contenu de référence appartient au coach de la démonstration. En
      // cas de panne, ces pistes neutres n'inventent donc ni métier ni entourage.
      if (annule) return;
      dispatch({
        type: 'aide',
        point: index,
        aide: {
          titre: 'Partez de ce que vous savez déjà, sans chercher la réponse parfaite.',
          pistes: [
            {
              texte: 'Je peux raconter un exemple récent avec mes propres mots.',
              effet:
                'Conséquence : un cas réel distingue ce qui doit être prévu de ce qui reste exceptionnel.',
            },
            {
              texte: 'Je peux décrire ce qui arrive le plus souvent.',
              effet:
                'Conséquence : le projet se concentre d’abord sur la situation habituelle.',
            },
            {
              texte: 'Je préfère indiquer ce qui reste encore à définir.',
              effet:
                'Conséquence : cette incertitude restera visible et devra être levée avant le devis final.',
            },
          ],
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
        source: suite.reponse.source,
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

      setErreur(null);
      dispatch({ type: 'submit' });
      try {
        const fil = state.echanges[index] ?? [];
        const historique = Boolean(fil[state.rang]?.reponse.trim());
        const dernierRangRepondu = fil.reduce(
          (dernier, echange, rang) => (echange.reponse.trim() ? rang : dernier),
          -1,
        );
        // Modifier la dernière réponse d'un point terminé ne doit pas ajouter
        // artificiellement une relance : on recalcule ses contenus dérivés en
        // conservant sa clôture. Une réponse intermédiaire, elle, rouvre le fil.
        const conserverCloture =
          historique && state.clos[index] && state.rang === dernierRangRepondu;
        await ecrire(texte, conserverCloture ? { ...extra, clore: true } : extra);
      } catch (cause) {
        // Le brouillon reste intact : le client peut réessayer sans retaper.
        setErreur(
          cause instanceof Error
            ? cause.message
            : "La réponse n'a pas pu être enregistrée. Réessayez.",
        );
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

  return { soumettre, confirmer, trancher, clore, erreur };
}
