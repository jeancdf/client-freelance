import { SiteHeader } from '../components/Headers';

export function Landing() {
  return (
    <main className="page page--landing">
      <SiteHeader />

      <section className="landing__hero" aria-labelledby="landing-title">
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

          <div className="landing__actions">
            <a href="/commencer" className="btn btn--primary landing__cta">
              Commencer mon cadrage
              <span aria-hidden="true">→</span>
            </a>
            <p className="landing__cta-note">
              Vous commencerez par quatre renseignements, puis la première question sera adaptée
              à votre situation.
            </p>
          </div>
        </div>
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
