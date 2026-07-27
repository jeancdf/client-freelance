import { useState } from 'react';
import { useCadrage } from '../CadrageContext';
import { SiteHeader } from '../components/Headers';
import { POINTS } from '../../shared/points';
import type { Maturite } from '../../shared/api';
import * as api from '../lib/api';

/**
 * La porte d'entrée publique. Un visiteur arrive du site de Nicolas sans avoir
 * jamais parlé à personne : il doit pouvoir ouvrir son cadrage lui-même, sinon
 * la page ne sert qu'à ceux qui ont déjà reçu un lien.
 *
 * Le formulaire envoie directement dans la première question : le visiteur a
 * déjà cliqué une fois, on ne lui redemande pas de cliquer sur son propre lien.
 * Celui-ci est posé dans la barre d'adresse, d'où il peut être mis en favori.
 */

interface Champ {
  cle: 'nom' | 'courriel' | 'metier' | 'demande';
  libelle: string;
  aide: string;
  type?: string;
  lignes?: number;
  exemple: string;
}

const CHAMPS: Champ[] = [
  { cle: 'nom', libelle: 'Votre nom', aide: '', exemple: 'Camille Dorval' },
  {
    cle: 'courriel',
    libelle: 'Votre adresse',
    aide: "Pour vous retrouver, et pour que Nicolas vous réponde.",
    type: 'email',
    exemple: 'camille@atelier-dorval.fr',
  },
  {
    cle: 'metier',
    libelle: 'Votre activité',
    aide: "C'est elle qui décide des questions posées.",
    exemple: 'Menuisier agenceur, six salariés',
  },
  {
    cle: 'demande',
    libelle: 'Ce que vous cherchez à faire',
    aide: 'Deux ou trois phrases suffisent. On creusera après.',
    lignes: 4,
    exemple:
      "Je perds des chantiers parce que les clients ne voient jamais mon travail, et je réponds trop tard aux demandes de devis.",
  },
];

/**
 * Où en est le visiteur. Ce n'est pas une case à cocher de convenance : elle
 * change les questions posées, et celui qui a déjà tout écrit va au dépôt de
 * document plutôt qu'à l'entretien.
 */
const DEPARTS: Array<{ cle: Maturite; titre: string; corps: string }> = [
  {
    cle: 'idee',
    titre: "Je sais ce qui me gêne, pas comment le régler",
    corps: "Je pars de votre quotidien. Aucune question technique, jamais.",
  },
  {
    cle: 'forme',
    titre: "J'ai une idée assez précise de ce que je veux",
    corps: "On parle du parcours et des écrans, et surtout du pourquoi.",
  },
  {
    cle: 'specs',
    titre: "J'ai déjà un cahier des charges",
    corps: "Vous le déposez, je le lis, je ne demande que ce qui manque.",
  },
];

const VIDE = { nom: '', courriel: '', metier: '', demande: '' };

export function Landing() {
  const { dispatch } = useCadrage();
  const [valeurs, setValeurs] = useState(VIDE);
  const [depart, setDepart] = useState<Maturite | ''>('');
  const [etat, setEtat] = useState<'repos' | 'envoi'>('repos');
  const [erreur, setErreur] = useState<string | null>(null);

  /**
   * Ouvre le cadrage et entre dans la première question sans rien demander de
   * plus. Le jeton est posé dans l'URL par `replaceState` plutôt que par une
   * navigation : le lien est là, prêt à être mis en favori, mais le client n'a
   * pas à le cliquer — il a déjà cliqué une fois, ça suffit.
   */
  async function ouvrir(evenement: React.FormEvent): Promise<void> {
    evenement.preventDefault();
    setEtat('envoi');
    setErreur(null);
    try {
      const cree = await api.ouvrirCadrage({ ...valeurs, maturite: depart as Maturite });
      window.history.replaceState(null, '', `/?c=${cree.token}`);

      const session = await api.lireSession(cree.token);
      dispatch({ type: 'hydrate', token: cree.token, session });
      // Celui qui a déjà tout écrit dépose son document ; les autres entrent
      // dans l'entretien.
      if (depart === 'specs') dispatch({ type: 'goScreen', screen: 'rapide' });
      else dispatch({ type: 'start', mode: 'long' });
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Impossible pour le moment.');
      setEtat('repos');
    }
  }

  return (
    <main className="page">
      <SiteHeader />

      <div className="landing__grid">
        <div className="landing__intro">
          <p className="lbl landing__kicker">Studio Cazals · cadrage de projet</p>
          <h1 className="serif landing__title">
            Dites-moi ce que vous voulez construire.
            <br />
            Vous repartez avec le dossier qui sert à le chiffrer.
          </h1>
          <p className="landing__lead">
            Un entretien écrit, seul, à votre rythme. Une question à la fois, adaptée à votre
            métier : vous répondez avec vos mots, ou vous choisissez parmi des réponses déjà
            rédigées et vous les corrigez.
          </p>
          <p className="landing__lead">
            À la fin, vous relisez tout. Ce que vous avez dit, ce que j'ai reformulé et que vous
            avez validé, ce que j'ai déduit sans vous le demander : les trois sont distingués, pour
            que rien ne passe pour votre parole sans l'être.
          </p>

          <div className="landing__points">
            <p className="lbl landing__points-label">Les huit points parcourus</p>
            <ol className="landing__points-list">
              {POINTS.map((point) => (
                <li key={point.num} className="landing__point">
                  <span className="landing__point-num">{point.num}</span>
                  <span className="landing__point-label">{point.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="landing__faits">
            <p className="landing__fait">
              <strong>Quinze minutes.</strong> Vous pouvez vous arrêter et reprendre : le lien vous
              ramène là où vous en étiez, depuis n'importe quel appareil.
            </p>
            <p className="landing__fait">
              <strong>Aucun compte à créer.</strong> Votre lien est votre dossier. Personne d'autre
              ne le lit que Nicolas.
            </p>
            <p className="landing__fait">
              <strong>Sans engagement.</strong> Le dossier vous appartient. S'il ne va pas plus
              loin avec moi, il servira au prestataire que vous choisirez.
            </p>
          </div>
        </div>

        <aside className="landing__aside">
          <form className="landing__form" onSubmit={(e) => void ouvrir(e)}>
            <p className="lbl landing__form-kicker">Commencer</p>
            <h2 className="serif landing__form-title">Quelques champs, puis on y va.</h2>

            {CHAMPS.map((champ) => (
              <div key={champ.cle} className="landing__champ">
                <label htmlFor={champ.cle} className="landing__label">
                  {champ.libelle}
                </label>
                {champ.aide && <p className="note landing__aide">{champ.aide}</p>}
                {champ.lignes ? (
                  <textarea
                    id={champ.cle}
                    required
                    rows={champ.lignes}
                    className="landing__input"
                    placeholder={champ.exemple}
                    value={valeurs[champ.cle]}
                    onChange={(e) => setValeurs((v) => ({ ...v, [champ.cle]: e.target.value }))}
                  />
                ) : (
                  <input
                    id={champ.cle}
                    required
                    type={champ.type ?? 'text'}
                    className="landing__input"
                    placeholder={champ.exemple}
                    value={valeurs[champ.cle]}
                    onChange={(e) => setValeurs((v) => ({ ...v, [champ.cle]: e.target.value }))}
                  />
                )}
              </div>
            ))}

            {/* Le point de départ décide du ton des questions, et envoie au
                dépôt de document celui qui a déjà tout écrit. */}
            <fieldset className="landing__depart">
              <legend className="landing__label landing__depart-legend">Où vous en êtes</legend>
              {DEPARTS.map((choix) => (
                <label
                  key={choix.cle}
                  className={
                    depart === choix.cle
                      ? 'landing__depart-option landing__depart-option--choisi'
                      : 'landing__depart-option'
                  }
                >
                  <input
                    type="radio"
                    name="depart"
                    required
                    className="landing__depart-radio"
                    value={choix.cle}
                    checked={depart === choix.cle}
                    onChange={() => setDepart(choix.cle)}
                  />
                  <span className="landing__depart-texte">
                    <span className="landing__depart-titre">{choix.titre}</span>
                    <span className="landing__depart-corps">{choix.corps}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {erreur && (
              <p className="landing__erreur" role="alert">
                {erreur}
              </p>
            )}

            <button
              type="submit"
              className="btn btn--primary landing__submit"
              disabled={etat === 'envoi'}
            >
              {etat === 'envoi'
                ? 'J’ouvre votre dossier…'
                : depart === 'specs'
                  ? 'Déposer mon document'
                  : 'Commencer l’entretien'}
            </button>

            <p className="note landing__meta">
              15 min environ · aucun compte · votre lien apparaît dans la barre d'adresse et vous
              ramènera ici
            </p>
          </form>
        </aside>
      </div>

      <footer className="accueil__footer">
        <span>Nicolas Cazals — développement sur mesure</span>
        <span>nicolas@studiocazals.fr</span>
      </footer>
    </main>
  );
}
