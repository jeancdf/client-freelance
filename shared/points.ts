/**
 * Les huit points du cadrage.
 *
 * Contenu repris tel quel de la maquette `Cadrage.dc.html` : c'est le script de
 * l'entretien, pas de la donnée de démonstration. Toute retouche ici change ce
 * que le client lit à l'écran.
 */

/** Une piste proposée quand le client répond « je ne sais pas ». */
export interface HelpItem {
  /** La piste, écrite avec les mots du client. */
  text: string;
  /** Ce que ce choix implique pour le projet, dit tout de suite. */
  effect: string;
}

export interface Help {
  title: string;
  items: HelpItem[];
}

export interface Point {
  /** Numéro romain affiché (I…VIII). */
  num: string;
  label: string;
  /**
   * Ce que le point doit établir, quelle que soit la façon dont on le demande.
   * C'est la partie durable du script : la question est reformulée pour chaque
   * client, l'intention ne bouge jamais — sinon le dossier perd sa garantie de
   * couverture.
   */
  intention: string;
  /** La question posée, formulation de référence. */
  q: string;
  /** La relance en italique sous la question. */
  hint: string;
  /** Réponses probables proposées ; la première sert aussi de réponse par défaut. */
  props: string[];
  /** Reformulation soumise à confirmation avant d'avancer (mode long). */
  reform?: string;
  /** Ce qui est déduit sans question supplémentaire. */
  deduit?: string;
  /** Ce qui reste ouvert et part tel quel au dossier. */
  ouvert?: string;
  /** Index dans `props` de la réponse qui déclenche l'arbitrage. */
  tensionOn?: number;
  help: Help;
}

export const POINTS: Point[] = [
  {
    num: 'I', label: 'Le problème',
    intention:
      "le déclencheur précis de la démarche, et ce que le problème lui coûte aujourd'hui en temps, en argent ou en clients perdus.",
    q: "Qu'est-ce qui vous a fait vous dire, un jour précis, qu'il fallait faire quelque chose ?",
    hint: "Racontez le dernier moment où ça vous a coûté cher — en temps, en client, en énervement.",
    props: [
      "Mes clients ne savent pas quoi faire quand je ne suis pas là. Je leur envoie des programmes en PDF sur WhatsApp, ils les perdent, et je passe mes dimanches à les refaire un par un.",
      "J'ai perdu deux clients ce trimestre : ils ne suivaient plus rien entre les séances et ont arrêté.",
      "Je n'arrive plus à prendre de nouveaux clients, la préparation me prend tout mon temps libre."
    ],
    reform: "vous passez environ quatre heures chaque dimanche à réécrire des programmes qui se perdent dans WhatsApp, et c'est ça qui vous empêche de prendre plus de clients.",
    help: {
      title: "Chez les coachs que j'accompagne, le déclic vient presque toujours d'une de ces trois choses.",
      items: [
        { text: "Le temps de préparation devenu ingérable.", effect: "Conséquence : on cherche d'abord la réutilisation des programmes, pas les fonctions visibles." },
        { text: "Des clients qui décrochent entre deux séances.", effect: "Conséquence : le cœur du projet devient le suivi et le rappel, côté client." },
        { text: "L'impression de ne plus savoir où en est chacun.", effect: "Conséquence : il faut une vue d'ensemble côté coach, avant tout le reste." }
      ]
    }
  },
  {
    num: 'II', label: 'Les utilisateurs',
    intention:
      "qui se servira de l'outil, à quel moment de sa journée, avec quelle aisance du numérique, et qui n'y touchera pas.",
    q: "Qui va se servir de cet outil, concrètement, et à quel moment de sa journée ?",
    hint: "Vous, vos clients, quelqu'un d'autre ? Dites-moi aussi ceux qui ne s'en serviront pas.",
    props: [
      "Mes clients, une quarantaine, entre 30 et 55 ans. Ils ne sont pas très à l'aise avec les applications, il faut que ce soit évident.",
      "Moi seul pour préparer, et mes clients pour consulter leur séance du jour.",
      "Moi, mes clients, et à terme deux coachs qui travailleraient avec moi.",
      "Uniquement moi : mes clients continueraient à recevoir un document."
    ],
    reform: "deux rôles seulement pour cette première version : vous qui préparez et suivez, vos clients qui consultent la séance du jour. Personne d'autre n'entre dans l'outil.",
    help: {
      title: "Trois façons de découper les utilisateurs, selon ce que vous visez.",
      items: [
        { text: "Vous seul, et vos clients simples lecteurs.", effect: "Conséquence : la version la plus rapide à construire, et la plus sûre côté clients." },
        { text: "Vous, vos clients, et un second coach plus tard.", effect: "Conséquence : il faut prévoir la notion de compte coach dès le début, sans la développer." },
        { text: "Vos clients autonomes, vous en retrait.", effect: "Conséquence : projet plus lourd — il faut de la pédagogie dans l'outil lui-même." }
      ]
    }
  },
  {
    num: 'III', label: 'Le fonctionnement actuel',
    intention:
      "le déroulé actuel, étape par étape, avec quels outils, et l'endroit exact où ça lui coûte du temps.",
    q: "Racontez-moi comment ça se passe aujourd'hui, du moment où un client vous demande un programme jusqu'à ce qu'il l'ait entre les mains.",
    hint: "Je cherche le détail concret : qui fait quoi, avec quels outils, et où ça vous coûte du temps.",
    props: [
      "Je l'écris à la main dans Word, je l'exporte en PDF, et je l'envoie par WhatsApp. Je ne sais jamais si la séance a été faite : je l'apprends à la séance suivante.",
      "Je note sur papier pendant la séance, et je ressaisis tout le soir.",
      "Tout passe par WhatsApp, je n'ai pas de méthode fixe."
    ],
    reform: "vous écrivez chaque programme à la main dans Word, vous l'envoyez en PDF par WhatsApp, et vous n'avez aucun moyen de savoir si la séance a été faite — vous le découvrez à la séance suivante.",
    help: {
      title: "Chez les coachs que j'accompagne, ça se passe presque toujours d'une de ces trois façons.",
      items: [
        { text: "Le client m'écrit, on fait le point au téléphone, puis j'écris son programme dans un document que je lui envoie.", effect: "Conséquence : l'application remplace le document que vous écrivez à la main. C'est le cœur du projet." },
        { text: "Je vois le client en salle, je note tout sur papier pendant la séance, et je ressaisis le soir.", effect: "Conséquence : il faut une saisie très rapide côté coach, utilisable debout, une main occupée." },
        { text: "Le client passe par mon site, choisit une formule, et je reçois un courriel avec ses réponses.", effect: "Conséquence : votre site devient une brique du projet, il faudra le brancher à l'application." }
      ]
    }
  },
  {
    num: 'IV', label: "L'existant à reprendre",
    intention:
      "ce qui existe déjà autour de son activité et qui devra être gardé, raccordé, ou laissé strictement de côté.",
    q: "Qu'est-ce qui existe déjà autour de votre activité et qui devra rester, ou être repris ?",
    hint: "Site, fichiers, logiciel de facturation, vidéos, tableur : même bricolé, ça compte.",
    props: [
      "J'ai un site vitrine fait par un cousin, sous WordPress. Et je facture avec Abby.",
      "Rien, à part mes documents Word et mes vidéos sur YouTube.",
      "Un tableur Google où je note les mensurations et les charges de chacun."
    ],
    deduit: "Le site vitrine reste en place et n'est pas touché. L'application vit à côté, sans lien avec la facturation au lancement.",
    help: {
      title: "Ce qui compte comme « existant », même si ça n'en a pas l'air.",
      items: [
        { text: "Un site, une page de réservation, une boutique.", effect: "Conséquence : à raccorder ou à laisser strictement de côté — c'est à décider maintenant." },
        { text: "Un outil de facturation ou de comptabilité.", effect: "Conséquence : souvent hors périmètre en v1, pour tenir le budget." },
        { text: "Des fichiers et des vidéos déjà produits.", effect: "Conséquence : à reprendre tels quels, c'est du temps gagné, pas du travail en plus." }
      ]
    }
  },
  {
    num: 'V', label: 'Le périmètre',
    intention:
      "la seule chose sans laquelle le projet ne sert à rien : le cœur, pas la liste complète.",
    q: "Si on ne construisait qu'une seule chose, celle sans laquelle ça ne sert à rien, laquelle ?",
    hint: "On ajoutera le reste ensuite. Je cherche le cœur, pas la liste complète.",
    props: [
      "Créer des programmes réutilisables et les adapter par client sans tout réécrire.",
      "Que le client voie sa séance du jour sur son téléphone, sans compte à créer.",
      "Que je sache qui a fait sa séance et qui ne l'a pas faite.",
      "Que chacun saisisse ses charges à chaque série, pour suivre sa progression."
    ],
    tensionOn: 3,
    reform: "le cœur du projet est la création de programmes réutilisables et adaptables par client ; la consultation de la séance du jour sur téléphone vient juste après, sans création de compte.",
    help: {
      title: "Trois cœurs possibles. Ils ne coûtent pas la même chose.",
      items: [
        { text: "La fabrication des programmes, côté coach.", effect: "Conséquence : c'est là que se trouve votre gain de temps immédiat." },
        { text: "La consultation par le client, côté téléphone.", effect: "Conséquence : c'est là que se joue l'adoption, mais le gain de temps arrive plus tard." },
        { text: "Le suivi de ce qui a été fait.", effect: "Conséquence : suppose que les deux premiers existent déjà — donc une v2." }
      ]
    }
  },
  {
    num: 'VI', label: 'Le hors-périmètre',
    intention:
      "ce que le projet ne fera pas dans cette première version, dit explicitement, pour protéger le budget.",
    q: "Qu'est-ce que ce projet ne fera pas ? C'est la question qui protège votre budget.",
    hint: "Ce dont vous ne voulez pas, ou ce qui peut attendre une deuxième version.",
    props: [
      "Je ne veux pas de messagerie dans l'application. Je garde WhatsApp pour parler à mes clients, ça marche très bien.",
      "Pas de paiement en ligne pour l'instant, je facture à côté.",
      "Pas de statistiques ni de courbes : je veux d'abord voir si mes clients l'ouvrent."
    ],
    reform: "hors périmètre pour cette première version : la messagerie, le paiement en ligne, et les statistiques de progression.",
    help: {
      title: "Ce que les coachs retirent le plus souvent de la première version.",
      items: [
        { text: "La messagerie interne.", effect: "Conséquence : WhatsApp reste le canal. Économie nette, et vos clients ne changent pas d'habitude." },
        { text: "Le paiement en ligne.", effect: "Conséquence : la facturation reste où elle est. C'est le poste le plus coûteux évité." },
        { text: "Les courbes et statistiques.", effect: "Conséquence : reportées en v2, une fois qu'on sait si l'outil est ouvert." }
      ]
    }
  },
  {
    num: 'VII', label: 'Les contraintes',
    intention:
      "ce qui est imposé et sur quoi le prestataire n'a pas la main : une date, un budget, un outil à garder, une personne à convaincre.",
    q: "Qu'est-ce qui est imposé, et sur quoi je n'ai pas la main ?",
    hint: "Une date, un budget, un outil à garder, une personne à convaincre.",
    props: [
      "Il faut que ce soit prêt avant septembre, c'est là que les gens reprennent le sport.",
      "Il faut que ça marche sur des téléphones anciens, certains clients n'en ont pas de récent.",
      "Je ne veux pas avoir à gérer un serveur ni des mises à jour moi-même.",
      "J'ai un budget, mais je préfère vous en parler de vive voix."
    ],
    ouvert: "Le budget n'a pas été abordé : vous avez préféré en parler de vive voix. C'est noté comme tel, ce n'est pas un oubli.",
    help: {
      title: "Les contraintes qui changent vraiment un chiffrage.",
      items: [
        { text: "Une date liée à votre activité.", effect: "Conséquence : elle fixe le périmètre de la v1, pas l'inverse." },
        { text: "Des téléphones anciens à supporter.", effect: "Conséquence : on écarte certaines technologies dès le départ." },
        { text: "Aucune envie d'administrer l'outil.", effect: "Conséquence : hébergement et maintenance entrent dans la prestation." }
      ]
    }
  },
  {
    num: 'VIII', label: 'La définition du succès',
    intention:
      "le signe concret auquel il verra, dans six mois, que ça valait le coup.",
    q: "Dans six mois, à quoi verrez-vous que ça valait le coup ?",
    hint: "Un signe concret, quelque chose que vous pourrez constater sans y réfléchir.",
    props: [
      "Si je ne passe plus mes dimanches à refaire des programmes, c'est gagné.",
      "Si mes clients ouvrent leur séance sans que j'aie à les relancer.",
      "Si je peux prendre dix clients de plus sans travailler davantage."
    ],
    reform: "deux repères mesurables à six mois : la préparation hebdomadaire passe de quatre heures à moins de deux, et huit clients sur dix ouvrent leur séance sans relance de votre part.",
    help: {
      title: "Trois façons de savoir que ça a marché.",
      items: [
        { text: "Du temps rendu, chaque semaine.", effect: "Conséquence : on mesure les heures de préparation avant et après." },
        { text: "Des clients qui s'en servent seuls.", effect: "Conséquence : on mesure l'ouverture des séances, sans rien demander à personne." },
        { text: "Plus de clients à charge égale.", effect: "Conséquence : le succès se juge sur votre carnet, pas sur l'outil." }
      ]
    }
  }
];
