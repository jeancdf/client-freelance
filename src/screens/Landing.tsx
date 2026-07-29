import { useState } from 'react';
import { useCadrage } from '../CadrageContext';
import { SiteHeader } from '../components/Headers';
import * as api from '../lib/api';

/**
 * La porte d'entrée publique. Un visiteur arrive du site de Nicolas sans avoir
 * jamais parlé à personne : il doit pouvoir ouvrir son cadrage lui-même, sinon
 * la page ne sert qu'à ceux qui ont déjà reçu un lien.
 *
 * Le formulaire envoie directement dans la première question, celle du point de
 * départ : le visiteur a déjà cliqué une fois, on ne lui redemande pas de
 * cliquer sur son propre lien. Celui-ci est posé dans la barre d'adresse, d'où
 * il peut être mis en favori.
 */

interface Champ {
  cle: 'nom' | 'courriel' | 'metier' | 'demande';
  libelle: string;
  aide: string;
  type?: string;
  lignes?: number;
  exemple: string;
  autocomplete?: string;
}

const CHAMPS: Champ[] = [
  {
    cle: 'demande',
    libelle: 'Votre projet, en quelques mots',
    aide:
      "Décrivez le problème à régler ou le résultat recherché. Vous n'avez pas besoin de connaître déjà la bonne façon de le construire.",
    lignes: 5,
    exemple:
      "Je reçois des demandes pendant mes interventions et j'en oublie certaines avant de pouvoir rappeler.",
  },
  {
    cle: 'metier',
    libelle: 'Votre activité',
    aide: 'Elle permet d’adapter les questions à votre quotidien réel.',
    exemple: 'Plombier indépendant, cabinet de conseil, association…',
    autocomplete: 'organization-title',
  },
  {
    cle: 'nom',
    libelle: 'Votre nom',
    aide: '',
    exemple: 'Camille Dorval',
    autocomplete: 'name',
  },
  {
    cle: 'courriel',
    libelle: 'Votre adresse e-mail',
    aide: 'Pour que Nicolas puisse vous répondre au sujet de ce projet.',
    type: 'email',
    exemple: 'camille@atelier-dorval.fr',
    autocomplete: 'email',
  },
];

const VIDE = { nom: '', courriel: '', metier: '', demande: '' };

export function Landing() {
  const { dispatch } = useCadrage();
  const [valeurs, setValeurs] = useState(VIDE);
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
      const cree = await api.ouvrirCadrage(valeurs);
      window.history.replaceState(null, '', `/?c=${cree.token}`);

      // `hydrate` choisit l'écran : un cadrage tout neuf ouvre sur la question
      // de départ, qui réglera le ton de l'entretien.
      const session = await api.lireSession(cree.token);
      dispatch({ type: 'hydrate', token: cree.token, session });
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Impossible pour le moment.');
      setEtat('repos');
    }
  }

  return (
    <main className="page page--landing">
      <SiteHeader />

      <section className="landing__grid" aria-labelledby="landing-title">
        <div className="landing__intro">
          <p className="lbl landing__kicker">Cadrage avant devis</p>
          <h1 id="landing-title" className="serif landing__title">
            Dites-moi ce que vous voulez construire. Vous repartez avec le dossier qui sert à le
            chiffrer.
          </h1>
          <p className="landing__lead">
            Vous racontez votre projet avec vos mots. Je transforme cet échange en un cadrage
            lisible : ce qu’il faut construire, ce qui attendra et les décisions à prendre avant
            un devis.
          </p>

          <ul className="landing__signaux" aria-label="Les garanties de l’entretien">
            <li>Une question à la fois</li>
            <li>Aucun compte à créer</li>
            <li>Reprise à tout moment</li>
          </ul>
        </div>

        <aside className="landing__aside">
          <form
            className="landing__form"
            onSubmit={(e) => void ouvrir(e)}
            aria-busy={etat === 'envoi'}
          >
            <div className="landing__form-head">
              <p className="lbl landing__form-kicker">Votre point de départ</p>
              <h2 className="serif landing__form-title">Parlez-moi de votre projet.</h2>
              <p className="landing__form-intro">
                Ces quelques repères servent à écrire une première question vraiment adaptée à
                votre situation.
              </p>
            </div>

            <div className="landing__fields">
              {CHAMPS.map((champ) => {
                const aideId = champ.aide ? `${champ.cle}-aide` : undefined;
                return (
                  <div
                    key={champ.cle}
                    className={`landing__champ landing__champ--${champ.cle}`}
                  >
                    <label htmlFor={champ.cle} className="landing__label">
                      {champ.libelle}
                    </label>
                    {champ.aide && (
                      <p id={aideId} className="landing__aide">
                        {champ.aide}
                      </p>
                    )}
                    {champ.lignes ? (
                      <textarea
                        id={champ.cle}
                        name={champ.cle}
                        required
                        rows={champ.lignes}
                        className="landing__input"
                        placeholder={champ.exemple}
                        aria-describedby={aideId}
                        value={valeurs[champ.cle]}
                        onChange={(e) =>
                          setValeurs((v) => ({ ...v, [champ.cle]: e.target.value }))
                        }
                      />
                    ) : (
                      <input
                        id={champ.cle}
                        name={champ.cle}
                        required
                        type={champ.type ?? 'text'}
                        autoComplete={champ.autocomplete}
                        className="landing__input"
                        placeholder={champ.exemple}
                        aria-describedby={aideId}
                        value={valeurs[champ.cle]}
                        onChange={(e) =>
                          setValeurs((v) => ({ ...v, [champ.cle]: e.target.value }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>

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
              {etat === 'envoi' ? 'J’ouvre votre dossier…' : 'Ouvrir mon dossier de cadrage'}
            </button>

            <p className="landing__meta">
              Après l’envoi, votre lien privé reste dans la barre d’adresse. Il permet
              d’interrompre l’entretien et de le reprendre plus tard.
            </p>
          </form>
        </aside>
      </section>

      <section className="landing__livrable" aria-labelledby="livrable-title">
        <div className="landing__section-head">
          <p className="lbl landing__section-kicker">Ce que vous obtenez</p>
          <div>
            <h2 id="livrable-title" className="serif landing__section-title">
              Un dossier qui permet de décider, pas un résumé automatique.
            </h2>
            <p className="landing__section-lead">
              Vos réponses deviennent un document lisible avant le rendez-vous. Les décisions
              prises, les hypothèses et les points encore ouverts restent clairement séparés.
            </p>
          </div>
        </div>

        <div className="landing__resultats">
          <article className="landing__resultat">
            <span className="landing__resultat-num">01</span>
            <h3 className="serif">Le cœur du projet</h3>
            <p>
              Les actions indispensables sont isolées et classées pour donner une base claire au
              premier devis.
            </p>
          </article>
          <article className="landing__resultat">
            <span className="landing__resultat-num">02</span>
            <h3 className="serif">Ses limites</h3>
            <p>
              Ce qui entre dans la première version, ce qui attendra et ce qui est écarté sont
              écrits noir sur blanc.
            </p>
          </article>
          <article className="landing__resultat">
            <span className="landing__resultat-num">03</span>
            <h3 className="serif">Les conditions du devis</h3>
            <p>
              Utilisateurs, éléments existants, contraintes et critères de réussite sont réunis
              sans masquer les incertitudes.
            </p>
          </article>
        </div>
      </section>

      <section className="landing__deroulement" aria-labelledby="deroulement-title">
        <div className="landing__deroulement-intro">
          <p className="lbl landing__section-kicker">Comment cela se passe</p>
          <h2 id="deroulement-title" className="serif landing__section-title">
            Vous avancez sans préparer un cahier des charges.
          </h2>
        </div>

        <ol className="landing__etapes">
          <li className="landing__etape">
            <span>01</span>
            <div>
              <h3>Vous racontez</h3>
              <p>
                Une question à la fois, avec vos mots ou à partir de propositions que vous pouvez
                corriger.
              </p>
            </div>
          </li>
          <li className="landing__etape">
            <span>02</span>
            <div>
              <h3>Je précise seulement ce qui compte</h3>
              <p>
                Une relance n’apparaît que si la réponse peut réellement changer le périmètre ou
                le chiffrage.
              </p>
            </div>
          </li>
          <li className="landing__etape">
            <span>03</span>
            <div>
              <h3>Vous relisez avant de transmettre</h3>
              <p>
                Rien n’est présenté comme votre parole sans que vous puissiez le relire et le
                corriger.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <aside className="landing__liberte">
        <p className="lbl landing__liberte-kicker">Le dossier reste le vôtre</p>
        <p className="serif landing__liberte-texte">
          Si le projet ne continue pas avec Studio Cazals, ce cadrage pourra servir au prestataire
          que vous choisirez.
        </p>
      </aside>

      <footer className="accueil__footer">
        <span>Nicolas Cazals — développement sur mesure</span>
        <a href="mailto:nicolas@studiocazals.fr">nicolas@studiocazals.fr</a>
      </footer>
    </main>
  );
}
