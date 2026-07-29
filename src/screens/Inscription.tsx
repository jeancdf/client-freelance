import { useState } from 'react';
import { useCadrage } from '../CadrageContext';
import { SiteHeader } from '../components/Headers';
import * as api from '../lib/api';

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
    lignes: 4,
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
    aide: 'Le nom à utiliser dans votre dossier.',
    exemple: 'Camille Dorval',
    autocomplete: 'name',
  },
  {
    cle: 'courriel',
    libelle: 'Votre adresse e-mail',
    aide: 'Pour que Nicolas puisse vous répondre.',
    type: 'email',
    exemple: 'camille@atelier-dorval.fr',
    autocomplete: 'email',
  },
];

const VIDE = { nom: '', courriel: '', metier: '', demande: '' };

export function Inscription() {
  const { dispatch } = useCadrage();
  const [valeurs, setValeurs] = useState(VIDE);
  const [etat, setEtat] = useState<'repos' | 'envoi'>('repos');
  const [erreur, setErreur] = useState<string | null>(null);

  async function ouvrir(evenement: React.FormEvent): Promise<void> {
    evenement.preventDefault();
    setEtat('envoi');
    setErreur(null);
    try {
      const cree = await api.ouvrirCadrage(valeurs);
      window.history.replaceState(null, '', `/?c=${cree.token}`);
      const session = await api.lireSession(cree.token);
      dispatch({ type: 'hydrate', token: cree.token, session });
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Impossible pour le moment.');
      setEtat('repos');
    }
  }

  return (
    <main className="page page--inscription">
      <SiteHeader />

      <section className="inscription__shell" aria-labelledby="inscription-title">
        <header className="inscription__head">
          <a href="/" className="inscription__retour">
            <span aria-hidden="true">←</span> Revenir à la présentation
          </a>
          <p className="lbl inscription__kicker">Votre point de départ</p>
          <h1 id="inscription-title" className="serif inscription__title">
            Commençons par votre situation.
          </h1>
        </header>

        <form
          className="landing__form inscription__form"
          onSubmit={(e) => void ouvrir(e)}
          aria-busy={etat === 'envoi'}
        >
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
                      onChange={(event) =>
                        setValeurs((actuelles) => ({
                          ...actuelles,
                          [champ.cle]: event.target.value,
                        }))
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
                      onChange={(event) =>
                        setValeurs((actuelles) => ({
                          ...actuelles,
                          [champ.cle]: event.target.value,
                        }))
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
            Aucun compte à créer. Votre lien de reprise restera dans la barre d’adresse.
          </p>
        </form>
      </section>
    </main>
  );
}
