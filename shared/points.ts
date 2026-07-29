/**
 * Les huit points possibles du cadrage, dont le point VI conditionnel.
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

/**
 * Contrat de génération propre à une section.
 *
 * L'intention décrit tout ce que le dossier devra finalement contenir. Ce
 * contrat évite de demander au modèle de tout obtenir dès la première
 * question, ce qui produisait des questions et des réponses fourre-tout.
 */
export interface ContratEntretien {
  /** Un seul axe à traiter au premier tour. */
  ouverture: string;
  /** Axes complémentaires, à prendre un par un et seulement s'ils manquent. */
  axesSuivants: string[];
  /** Nombre minimal de réponses avant que le point puisse être clos. */
  questionsMin: number;
  propositions: {
    /** Forme sémantique attendue pour chaque carte. */
    forme: string;
    choix: 'unique' | 'multiple';
    min: number;
    max: number;
    /** Limite indicative, ensuite contrôlée côté serveur. */
    maxMots: number;
    /** Vrai si une carte doit porter une seule idée, sans liste interne. */
    atomiques: boolean;
  };
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
  /** Règles de génération propres à ce point et au premier tour. */
  entretien: ContratEntretien;
  /** Force une sélection multiple bornée sur la première question du point. */
  selection?: { min: number; max: number };
  /** La première réponse doit être suivie d'un classement explicite. */
  priorisation?: boolean;
  /** Ce point n'existe que si une décision préalable l'a rendu utile. */
  conditionnel?: boolean;
  /** Le premier tour prend la forme d'un formulaire structuré. */
  configurateur?: 'contraintes';
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

export function questionsMinimales(point: Point): number {
  return Math.max(1, point.entretien.questionsMin);
}

export const INDEX_PERIMETRE = 4;
export const INDEX_HORS_PERIMETRE = 5;
export const INDEX_CONTRAINTES = 6;

export interface ConfigurationContraintes {
  delai: string;
  budget: string;
  technologies: string;
}

const LIBELLES_CONTRAINTES: Record<keyof ConfigurationContraintes, string> = {
  delai: 'Délai',
  budget: 'Budget',
  technologies: 'Demandes technologiques',
};

/** Transforme les champs du configurateur en réponse lisible partout ailleurs. */
export function serialiserContraintes(
  configuration: ConfigurationContraintes,
): string {
  return (Object.keys(LIBELLES_CONTRAINTES) as Array<
    keyof ConfigurationContraintes
  >)
    .map((champ) => {
      // Ne pas rogner ici : cette fonction tourne à chaque frappe. Supprimer
      // l'espace final empêcherait tout simplement de saisir plusieurs mots.
      const valeur = configuration[champ].replace(/\r?\n/g, ' ');
      return `${LIBELLES_CONTRAINTES[champ]} : ${valeur}`;
    })
    .join('\n');
}

/** Relit aussi une saisie en cours après rechargement ou réouverture du point. */
export function lireContraintes(texte: string): ConfigurationContraintes {
  const configuration: ConfigurationContraintes = {
    delai: '',
    budget: '',
    technologies: '',
  };
  let trouve = false;

  for (const ligne of texte.split('\n')) {
    for (const champ of Object.keys(LIBELLES_CONTRAINTES) as Array<
      keyof ConfigurationContraintes
    >) {
      const prefixe = `${LIBELLES_CONTRAINTES[champ]} :`;
      if (!ligne.startsWith(prefixe)) continue;
      configuration[champ] = ligne.slice(prefixe.length).trimStart();
      trouve = true;
    }
  }

  // Un ancien dossier peut contenir une réponse libre à cet endroit. On la
  // conserve dans le champ le plus large au lieu de la faire disparaître.
  if (!trouve && texte.trim()) configuration.technologies = texte.trim();
  return configuration;
}

/**
 * Deuxième question de secours quand aucun modèle n'est disponible. En temps
 * normal, l'IA écrit une relance directement à partir de la première réponse.
 */
export function relanceDePrecision(point: Point, reponses: string[] = []) {
  if (point.priorisation) {
    const elements = reponses
      .flatMap((reponse) => reponse.split('\n'))
      .map((element) => element.trim())
      .filter(Boolean)
      .slice(0, 3);
    while (elements.length < 3) elements.push('…');

    const labels = [
      'Priorité 1 — à traiter en premier',
      'Priorité 2 — à traiter ensuite',
      'Priorité 3 — cruciale pour le projet',
    ];
    const ordre = (indices: number[]) =>
      indices.map((index, rang) => `${labels[rang]} : ${elements[index]}`).join('\n');

    return {
      question: 'Quel label de priorité attribuez-vous à chacun de ces trois éléments ?',
      relance:
        "Classez-les de 1 à 3. Le troisième reste crucial : ce classement fixe l'ordre d'attention, pas ce qui serait facultatif.",
      propositions: [
        ordre([0, 1, 2]),
        ordre([1, 0, 2]),
        ordre([2, 0, 1]),
      ],
      choix: 'unique' as const,
    };
  }

  if (point.conditionnel) {
    return {
      question:
        'Quelle conséquence cette décision doit-elle avoir sur la première version ?',
      relance:
        'Dites si son contenu change maintenant, si une extension future doit seulement rester possible, ou si rien ne doit être prévu.',
      propositions: [
        'Le contenu de la première version change maintenant, et le budget doit être revu.',
        "La première version ne change pas, mais il faut préserver la possibilité de l'ajouter plus tard.",
        'Rien ne doit être prévu : ce besoin reste complètement écarté.',
      ],
      choix: 'unique' as const,
    };
  }

  if (point.configurateur === 'contraintes') {
    return {
      question:
        "Existe-t-il d'autres contraintes non classiques que ce configurateur n'a pas couvertes ?",
      relance:
        "Par exemple un circuit de validation interne, une règle métier ou légale, une dépendance extérieure, une exigence d'accessibilité ou une autorisation à obtenir.",
      propositions: [
        "Non, je ne vois pas d'autre contrainte à ajouter.",
        'Un circuit de validation interne peut bloquer la décision.',
        'Une règle métier, légale ou de sécurité particulière doit être respectée.',
        "Le projet dépend d'un prestataire, d'une autorisation ou d'un calendrier extérieur.",
      ],
      choix: 'unique' as const,
    };
  }

  return {
    question:
      "Qu'est-ce qui rend votre réponse concrète dans votre quotidien : un exemple, un nombre ou une contrainte ?",
    relance:
      'Ajoutez seulement le détail qui change réellement la compréhension du projet. Si votre réponse est déjà assez précise, vous pouvez passer à la section suivante.',
    propositions: [],
    choix: 'unique' as const,
  };
}

export const POINTS: Point[] = [
  {
    num: 'I', label: 'Le problème',
    intention:
      "le déclencheur précis de la démarche, et ce que le problème lui coûte aujourd'hui en temps, en argent ou en clients perdus.",
    q: "Qu'est-ce qui vous a fait vous dire, un jour précis, qu'il fallait faire quelque chose ?",
    hint:
      "Partez du dernier incident précis, même s'il paraît banal. Ce récit permet d'identifier le problème réel avant de parler de fonctionnalités ou de choisir trop vite une façon de le traiter.",
    props: [
      "Mes clients ne savent pas quoi faire quand je ne suis pas là. Je leur envoie des programmes en PDF sur WhatsApp, ils les perdent, et je passe mes dimanches à les refaire un par un.",
      "J'ai perdu deux clients ce trimestre : ils ne suivaient plus rien entre les séances et ont arrêté.",
      "Je n'arrive plus à prendre de nouveaux clients, la préparation me prend tout mon temps libre."
    ],
    entretien: {
      ouverture:
        "faire raconter le déclic ou le dernier incident concret qui a déclenché la démarche, sans demander encore toutes ses conséquences",
      axesSuivants: [
        "le coût principal de ce problème aujourd'hui : temps, argent, occasions ou clients perdus",
        "la fréquence ou l'ordre de grandeur, uniquement s'il change le chiffrage",
      ],
      questionsMin: 1,
      propositions: {
        forme: 'un seul déclic ou incident concret par carte',
        choix: 'unique',
        min: 3,
        max: 4,
        maxMots: 24,
        atomiques: true,
      },
    },
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
    hint:
      "Nommez séparément chaque personne ou groupe directement concerné par la première version. Cette distinction détermine les accès et les parcours à prévoir, sans attribuer un rôle à un proche ou à un collègue que vous n'avez pas cité.",
    props: [
      "Mes clients, une quarantaine, entre 30 et 55 ans. Ils ne sont pas très à l'aise avec les applications, il faut que ce soit évident.",
      "Moi seul pour préparer, et mes clients pour consulter leur séance du jour.",
      "Moi, mes clients, et à terme deux coachs qui travailleraient avec moi.",
      "Uniquement moi : mes clients continueraient à recevoir un document."
    ],
    entretien: {
      ouverture:
        "identifier les personnes qui utiliseront directement la première version, avec un seul rôle ou groupe par carte",
      axesSuivants: [
        "le moment concret où chaque personne s'en sert",
        "son aisance avec le numérique si elle change l'interface",
        "les personnes explicitement exclues de la première version",
      ],
      questionsMin: 1,
      propositions: {
        forme:
          "un seul rôle ou groupe d'utilisateurs par carte, sans lui attribuer d'action encore inconnue",
        choix: 'multiple',
        min: 3,
        max: 5,
        maxMots: 18,
        atomiques: true,
      },
    },
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
    q: "Comment cette demande est-elle traitée aujourd'hui, du début à la fin ?",
    hint:
      "Suivez un cas habituel, étape après étape, sans chercher à le rendre parfait. Ce déroulé montre ce qui doit rester, disparaître ou être raccordé, et situe l'endroit où le projet peut réellement faire gagner du temps.",
    props: [
      "Je l'écris à la main dans Word, je l'exporte en PDF, et je l'envoie par WhatsApp. Je ne sais jamais si la séance a été faite : je l'apprends à la séance suivante.",
      "Je note sur papier pendant la séance, et je ressaisis tout le soir.",
      "Tout passe par WhatsApp, je n'ai pas de méthode fixe."
    ],
    entretien: {
      ouverture:
        "faire choisir ou raconter un seul déroulé actuel cohérent, du déclencheur au résultat",
      axesSuivants: [
        "l'étape exacte où du temps se perd ou une information se perd",
        "les outils réellement utilisés, seulement s'ils ne sont pas encore connus",
      ],
      questionsMin: 1,
      propositions: {
        forme:
          "un scénario actuel cohérent par carte ; plusieurs étapes sont admises si elles décrivent le même déroulé",
        choix: 'unique',
        min: 3,
        max: 4,
        maxMots: 36,
        atomiques: false,
      },
    },
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
    hint:
      "Pensez aux fichiers, données, sites et logiciels déjà utilisés, même s'ils sont simples. Les connaître évite de reconstruire ce qui fonctionne et permet de chiffrer seulement les reprises ou les raccordements réellement nécessaires.",
    props: [
      "J'ai un site vitrine fait par un cousin, sous WordPress. Et je facture avec Abby.",
      "Rien, à part mes documents Word et mes vidéos sur YouTube.",
      "Un tableur Google où je note les mensurations et les charges de chacun."
    ],
    entretien: {
      ouverture:
        "recenser ce qui existe déjà et pourrait être conservé, repris ou raccordé, avec une seule catégorie d'existant par carte",
      axesSuivants: [
        "ce qui doit être raccordé à la première version",
        "ce qui doit rester strictement inchangé ou séparé",
      ],
      questionsMin: 1,
      propositions: {
        forme:
          'une seule catégorie par carte : site, fichiers, données, logiciel ou aucun existant',
        choix: 'multiple',
        min: 3,
        max: 5,
        maxMots: 20,
        atomiques: true,
      },
    },
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
      "les trois éléments principaux sans lesquels le projet ne remplit pas son rôle, puis leur ordre de priorité explicite sans rendre le troisième facultatif.",
    q: 'Quelles sont les trois choses principales que le projet doit absolument permettre ?',
    hint:
      "Une carte doit décrire une seule action du système, pas une liste de bénéfices. Choisissez-en exactement trois : elles formeront le cœur du premier devis et vous les classerez au tour suivant sans rendre la troisième facultative.",
    props: [
      "Créer des programmes réutilisables et les adapter par client sans tout réécrire.",
      "Que le client voie sa séance du jour sur son téléphone, sans compte à créer.",
      "Que je sache qui a fait sa séance et qui ne l'a pas faite.",
      "Que chacun saisisse ses charges à chaque série, pour suivre sa progression."
    ],
    entretien: {
      ouverture:
        "faire sélectionner exactement trois actions fonctionnelles vitales, sans les classer à ce tour",
      axesSuivants: [
        "le classement explicite des trois actions, sans rendre la troisième facultative",
      ],
      questionsMin: 2,
      propositions: {
        forme:
          "une seule action observable du système par carte, sans bénéfice, justification ni deuxième action",
        choix: 'multiple',
        min: 6,
        max: 6,
        maxMots: 18,
        atomiques: true,
      },
    },
    selection: { min: 3, max: 3 },
    priorisation: true,
    tensionOn: 3,
    reform:
      "vos trois priorités sont toutes cruciales : d'abord créer des programmes réutilisables et adaptables, ensuite permettre leur consultation sur téléphone, puis suivre les séances réalisées ; leur classement fixe l'ordre d'attention, pas ce qui serait facultatif.",
    help: {
      title: 'Trois façons de préciser ce qui doit entrer dans vos priorités.',
      items: [
        { text: "La fabrication des programmes, côté coach.", effect: "Conséquence : c'est là que se trouve votre gain de temps immédiat." },
        { text: "La consultation par le client, côté téléphone.", effect: "Conséquence : c'est là que se joue l'adoption, mais le gain de temps arrive plus tard." },
        { text: "Le suivi de ce qui a été fait.", effect: "Conséquence : suppose que les deux premiers existent déjà — donc une v2." }
      ]
    }
  },
  {
    num: 'VI', label: 'Le hors-périmètre',
    conditionnel: true,
    intention:
      "la décision à prendre sur un besoin supplémentaire que le client a explicitement évoqué en dehors de ses trois priorités : l'intégrer, le reporter ou l'écarter.",
    q: "Faut-il intégrer, reporter ou écarter ce besoin de la première version ?",
    hint:
      "Décidez uniquement du besoin supplémentaire déjà relevé, sans rouvrir vos trois priorités. Votre choix dira s'il modifie maintenant le périmètre et le budget, s'il doit seulement rester possible plus tard, ou s'il est complètement écarté.",
    props: [
      "Je le reporte à une version suivante, mais il faut préserver la possibilité de l'ajouter.",
      "Je l'écarte complètement : il ne fait pas partie du projet.",
      "Il doit finalement entrer dans la première version, même si cela change le budget."
    ],
    entretien: {
      ouverture:
        "obtenir une seule décision sur le besoin supplémentaire déjà nommé : l'intégrer, le reporter ou l'écarter",
      axesSuivants: [
        "la conséquence de cette décision sur la première version, seulement si elle reste ambiguë",
      ],
      questionsMin: 1,
      propositions: {
        forme: 'une décision nette par carte : intégrer, reporter ou écarter',
        choix: 'unique',
        min: 3,
        max: 3,
        maxMots: 24,
        atomiques: true,
      },
    },
    reform:
      "le besoin supplémentaire évoqué est explicitement reporté ou écarté de la première version ; il n'est pas devenu une priorité implicite.",
    help: {
      title: 'Trois décisions possibles pour ce besoin supplémentaire.',
      items: [
        { text: "Je le reporte à plus tard.", effect: "Conséquence : on préserve son ajout futur sans le chiffrer dans la première version." },
        { text: "Je l'écarte complètement.", effect: "Conséquence : il ne pèse ni sur l'architecture ni sur le budget." },
        { text: "Je le réintègre à la première version.", effect: "Conséquence : le périmètre et le chiffrage doivent être revus avant d'avancer." }
      ]
    }
  },
  {
    num: 'VII', label: 'Les contraintes',
    intention:
      "le délai, le budget et les demandes technologiques imposées, puis toute autre contrainte non classique sur laquelle le prestataire n'a pas la main.",
    q: 'Quels délai, budget et demandes technologiques spécifiques encadrent le projet ?',
    hint:
      "Renseignez chaque champ, même avec « à définir » ou « aucune ». Ces trois réponses cadrent les limites connues ; une seconde question cherchera uniquement une contrainte atypique que le délai, le budget et la technologie ne peuvent pas couvrir.",
    props: [
      serialiserContraintes({
        delai: "Avant septembre, au moment où l'activité reprend",
        budget: 'À définir ensemble',
        technologies: 'Compatible avec les téléphones anciens ; aucune technologie imposée',
      }),
    ],
    entretien: {
      ouverture:
        'renseigner séparément le délai, le budget et les demandes technologiques dans le configurateur',
      axesSuivants: [
        "une éventuelle contrainte atypique non couverte par le configurateur",
        "la conséquence concrète d'une contrainte atypique, uniquement si elle reste ambiguë",
      ],
      questionsMin: 2,
      propositions: {
        forme: 'une seule contrainte atypique ou une absence de contrainte par carte',
        choix: 'unique',
        min: 3,
        max: 4,
        maxMots: 24,
        atomiques: true,
      },
    },
    configurateur: 'contraintes',
    help: {
      title: "Les contraintes moins visibles que le configurateur ne peut pas deviner.",
      items: [
        { text: "Un circuit de validation interne s'applique avant que le projet avance.", effect: "Conséquence : les validations entrent dans le calendrier et peuvent bloquer une étape." },
        { text: "Une règle métier, légale, de sécurité ou d'accessibilité s'impose.", effect: "Conséquence : elle doit être vérifiée et chiffrée avant de choisir la façon de construire." },
        { text: "Le projet dépend d'un prestataire, d'une autorisation ou de données extérieures.", effect: "Conséquence : cette dépendance devient un risque explicite du planning." }
      ]
    }
  },
  {
    num: 'VIII', label: 'La définition du succès',
    intention:
      "le signe concret auquel il verra, dans six mois, que ça valait le coup.",
    q: "Dans six mois, à quoi verrez-vous que ça valait le coup ?",
    hint:
      "Choisissez un signe que vous pourrez réellement observer, sans inventer aujourd'hui une cible inconnue. Il servira ensuite à vérifier le résultat du projet avec un fait concret, plutôt qu'avec une impression générale.",
    props: [
      "Si je ne passe plus mes dimanches à refaire des programmes, c'est gagné.",
      "Si mes clients ouvrent leur séance sans que j'aie à les relancer.",
      "Si je peux prendre dix clients de plus sans travailler davantage."
    ],
    entretien: {
      ouverture:
        "identifier les signes observables qui permettront de juger le projet utile dans six mois, avec un seul indicateur par carte",
      axesSuivants: [
        "la manière de constater l'indicateur, seulement si elle n'est pas évidente",
        "un ordre de grandeur déjà connu, sans inventer de cible chiffrée",
      ],
      questionsMin: 1,
      propositions: {
        forme:
          "un seul indicateur observable par carte, sans inventer de chiffre ou de cible absente du dossier",
        choix: 'multiple',
        min: 3,
        max: 4,
        maxMots: 20,
        atomiques: true,
      },
    },
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
