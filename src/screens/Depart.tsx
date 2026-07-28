import { useState } from 'react';
import { useCadrage } from '../CadrageContext';
import { AppHeader } from '../components/Headers';
import type { Maturite } from '../../shared/api';
import * as api from '../lib/api';

/**
 * La première question de l'entretien, avant les points du cadrage : où en est le
 * client. Elle est ici et non dans le formulaire d'inscription parce que c'est
 * une question, pas un renseignement — et parce que sa réponse décide du ton de
 * tout ce qui suit.
 *
 * Elle est posée avant que le premier point ne soit écrit : le modèle doit la
 * connaître au moment où il rédige la question I.
 */
const DEPARTS: Array<{ cle: Maturite; titre: string; corps: string }> = [
  {
    cle: 'idee',
    titre: 'Je sais ce qui me gêne, pas comment le régler',
    corps: "Je pars de votre quotidien. Aucune question technique, jamais.",
  },
  {
    cle: 'forme',
    titre: "J'ai une idée assez précise de ce que je veux",
    corps: 'On parle du parcours et des écrans, et surtout du pourquoi.',
  },
  {
    cle: 'specs',
    titre: "J'ai déjà un cahier des charges",
    corps: 'Vous le déposez, je le lis, je ne demande que ce qui manque.',
  },
];

export function Depart() {
  const { state, dispatch } = useCadrage();
  const [occupe, setOccupe] = useState<Maturite | null>(null);

  async function choisir(maturite: Maturite): Promise<void> {
    setOccupe(maturite);
    const token = state.session?.token;

    // L'écriture doit aboutir avant la suite : la question du point I est
    // rédigée à partir de ce choix, et elle est mise en cache une fois pour
    // toutes. La poser trop tôt la figerait sans lui.
    if (token) {
      try {
        await api.patcher(token, { maturite });
      } catch {
        // Le serveur n'a pas pris : l'entretien continue, moins bien réglé.
      }
    }

    dispatch({ type: 'depart', maturite });
    if (maturite === 'specs') dispatch({ type: 'goScreen', screen: 'rapide' });
    else dispatch({ type: 'start', mode: 'long' });
  }

  return (
    <div>
      <AppHeader mode={`Cadrage — ${state.session?.client.nom ?? 'Démonstration'}`} truncate />

      <main className="depart">
        <div className="depart__body">
          <p className="lbl depart__kicker">Avant le cadrage — une question</p>
          <h1 className="serif depart__title">Où en êtes-vous, aujourd'hui ?</h1>
          <p className="depart__lead">
            Votre réponse décide des questions que je vais vous poser. Il n'y a pas de bonne
            réponse : les trois arrivent chez moi aussi souvent.
          </p>

          <div className="depart__choix">
            {DEPARTS.map((choix) => (
              <button
                key={choix.cle}
                type="button"
                className="depart__option"
                disabled={occupe !== null}
                onClick={() => void choisir(choix.cle)}
              >
                <span className="depart__option-titre">{choix.titre}</span>
                <span className="depart__option-corps">
                  {occupe === choix.cle ? 'Je prépare vos questions…' : choix.corps}
                </span>
              </button>
            ))}
          </div>

          <p className="note depart__note">
            Enregistré à chaque mot · fermez cette page, le lien vous ramènera ici
          </p>
        </div>
      </main>
    </div>
  );
}
