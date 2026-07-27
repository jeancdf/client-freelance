import { useState } from 'react';
import { useCadrage } from '../CadrageContext';
import { AppHeader } from '../components/Headers';
import { POINTS } from '../../shared/points';
import { answerOf } from '../state';
import { dateLongue, minutes } from '../lib/dates';
import * as api from '../lib/api';

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function Recap() {
  const { state, dispatch } = useCadrage();
  const session = state.session;
  const [envoi, setEnvoi] = useState<'repos' | 'envoi' | 'erreur'>('repos');

  const enTete = session
    ? `Cadrage — ${session.client.nom} · ${dateLongue(session.majLe)} · ${minutes(session.dureeMs)} minutes`
    : 'Cadrage — Camille Dorval · 12 mars 2026 · 17 minutes';

  async function valider(): Promise<void> {
    if (!session) {
      dispatch({ type: 'goScreen', screen: 'fin' });
      return;
    }
    setEnvoi('envoi');
    try {
      const resultat = await api.validerDossier(session.token);
      dispatch({ type: 'dossierValide', valideLe: resultat.valideLe, dureeMs: resultat.dureeMs });
      dispatch({ type: 'goScreen', screen: 'fin' });
    } catch {
      setEnvoi('erreur');
    }
  }

  return (
    <div>
      <AppHeader mode="Récapitulatif" saved />

      <main className="recap__main">
        <div className="recap__head">
          <p className="lbl recap__kicker">{enTete}</p>
          <h1 className="serif recap__title">Voilà votre projet, tel que je l'ai compris.</h1>
          <p className="recap__lead">
            Relisez, corrigez ce qui vous semble faux, puis validez. Ce document part chez Nicolas
            Cazals et sert de base au chiffrage.
          </p>
        </div>

        {/* La légende n'est pas décorative : elle dit au client comment
            distinguer ses mots des miens, point par point. */}
        <div className="legend">
          <p className="lbl legend__label">Trois écritures, pour que rien ne se confonde</p>
          <div className="legend__list">
            <p className="legend__row legend__row--quoted">
              <span className="legend__lede">En romain entre guillemets :</span> vos mots, exactement
              comme vous les avez écrits. Jamais retouchés.
            </p>
            <p className="legend__row">
              En texte courant, avec la mention{' '}
              <span className="legend__mention">reformulé · confirmé</span> : ma formulation, que
              vous avez validée pendant l'entretien.
            </p>
            <p className="legend__row">
              Sur fond crème, avec la mention <span className="legend__mention">déduit</span> : ce
              que j'ai supposé sans vous le demander. À vous de dire si c'est juste.
            </p>
          </div>
        </div>

        {POINTS.map((point, k) => {
          // Sur un vrai dossier, un point sans réponse reste vide : on ne
          // remplit jamais le récapitulatif à la place du client.
          const repondu = state.answers[k] !== undefined;
          const afficher = repondu || !session;
          const reformule = session ? repondu && Boolean(state.confirmed[k]) : Boolean(point.reform);

          return (
            <section key={point.num} className="recap__section">
              <h2 className="recap__section-title">
                {point.num} — {point.label}
              </h2>
              <div className="recap__blocks">
                {afficher ? (
                  <p className="recap__quote">« {answerOf(state, k)} »</p>
                ) : (
                  <p className="recap__manquant">
                    Pas encore renseigné — ce point partira vide si vous validez maintenant.
                  </p>
                )}

                {reformule && point.reform && (
                  <div>
                    <p className="lbl recap__sub-label">Reformulé · confirmé</p>
                    <p className="recap__reform">{capitalise(point.reform)}</p>
                  </div>
                )}

                {afficher && point.deduit && (
                  <div className="recap__deduit">
                    <p className="lbl recap__sub-label">Déduit — vous ne me l'avez pas dit</p>
                    <p className="recap__deduit-text">{point.deduit}</p>
                    <div className="recap__deduit-actions">
                      <button type="button" className="btn btn--soft recap__deduit-btn">
                        C'est juste
                      </button>
                      <button
                        type="button"
                        className="btn btn--underline recap__deduit-btn"
                        onClick={() => dispatch({ type: 'goStep', step: k })}
                      >
                        Corriger
                      </button>
                    </div>
                  </div>
                )}

                {afficher && point.ouvert && (
                  <div className="recap__ouvert">
                    <p className="lbl recap__sub-label">Resté ouvert — à traiter au rendez-vous</p>
                    <p className="recap__ouvert-text">{point.ouvert}</p>
                  </div>
                )}

                <button
                  type="button"
                  className="btn--accent recap__edit"
                  onClick={() => dispatch({ type: 'goStep', step: k })}
                >
                  {repondu || !session ? 'Modifier ce point' : 'Répondre à ce point'}
                </button>
              </div>
            </section>
          );
        })}

        <div className="recap__foot">
          <p className="recap__foot-text">
            Un point vous semble faux ? Corrigez-le avant de valider : vos corrections l'emportent
            toujours sur ma formulation.
          </p>
          <div className="recap__foot-actions">
            <button
              type="button"
              className="btn btn--primary recap__validate"
              onClick={() => void valider()}
              disabled={envoi === 'envoi'}
            >
              {envoi === 'envoi' ? 'Envoi en cours…' : 'Valider et envoyer à Nicolas Cazals'}
            </button>
          </div>
          {envoi === 'erreur' && (
            <p className="recap__erreur" role="alert">
              L'envoi n'a pas abouti. Vos réponses sont enregistrées — réessayez dans un instant.
            </p>
          )}
          <p className="recap__foot-note">
            Vous recevrez une copie de ce document par courriel · modifiable jusqu'au rendez-vous
          </p>
        </div>
      </main>
    </div>
  );
}
