/**
 * Ce qui occupe la place d'un contenu pendant qu'il s'écrit.
 *
 * La règle qu'il fait tenir : les textes de la maquette sont un repli de panne,
 * jamais un écran d'attente. Les afficher d'abord ferait lire une question, ou
 * trois pistes, avant de les remplacer par d'autres — on préfère attendre que
 * de voir le texte changer sous les yeux.
 *
 * La barre avance sur la durée observée puis s'arrête avant la fin : elle ne
 * prétend pas savoir quand le modèle aura terminé, elle ne se complète qu'en
 * disparaissant.
 */
interface AttenteProps {
  /** Ce qui est en train de s'écrire, à la première personne. */
  texte: string;
  /** Durée observée en production, en secondes. Règle l'allure de la barre. */
  duree: number;
  note?: string;
}

export function Attente({ texte, duree, note }: AttenteProps) {
  return (
    <div className="attente" role="status" aria-live="polite">
      <p className="serif attente__texte">{texte}</p>
      <div className="attente__piste" aria-hidden="true">
        <span className="attente__barre" style={{ animationDuration: `${duree}s` }} />
      </div>
      {note && <p className="note attente__note">{note}</p>}
    </div>
  );
}
