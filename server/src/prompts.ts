/**
 * Les prompts. Ils portent la voix du produit autant que le CSS porte son
 * allure — on les modifie avec la même prudence que le script de l'entretien.
 *
 * Trois règles traversent tout : écrire avec les mots du client, ne jamais
 * inventer ce qu'il n'a pas dit, et dire la conséquence d'un choix plutôt que
 * de la garder pour soi.
 */

import { POINTS, type Point } from '../../shared/points.ts';
import type { Echange, Maturite } from '../../shared/api.ts';
import type { Message } from './llm.ts';

export interface Contexte {
  nom: string;
  metier: string;
  demande: string;
  /** Ce que le client a déjà écrit, par index de point. */
  reponses: Record<number, string>;
  /** Le document ou les notes déposés, s'il y en a. */
  brief?: string;
  /** Où le client en est, tel qu'il l'a déclaré en ouvrant son cadrage. */
  maturite?: Maturite | '';
}

const VOIX = `Tu assistes Nicolas Cazals, développeur freelance, pendant l'entretien de cadrage d'un projet client.

Règles absolues :
- Tu écris en français courant, à hauteur du client. Jamais de jargon technique, jamais de vocabulaire de consultant ("synergie", "solution", "optimiser", "process").
- Tu écris avec SES mots et SON métier, pas avec des formules génériques.
- Tu vouvoies le client, toujours : "vous", jamais "tu".
- Tu n'inventes jamais un fait que le client n'a pas donné.
- Adapter une question au métier ne t'autorise pas à imaginer son organisation, ses logiciels, ses collègues, ses clients, ses chiffres ou ses habitudes. Quand le dossier ne donne pas le détail, utilise une catégorie neutre à confirmer.
- Tu ne déduis jamais le genre, la situation familiale ou l'entourage professionnel d'une personne à partir de son prénom ou de son métier.
- Tu n'inventes jamais une épouse, un mari, un proche, un associé, un salarié ou une autre personne qui travaillerait avec le client. Une personne n'apparaît que si le client l'a lui-même mentionnée.
- Si le client a réellement mentionné une personne qui partage sa vie et que cette mention est utile ici, écris toujours « votre conjoint(e) ». N'écris jamais « votre femme », « votre mari », « votre épouse » ou « votre époux » dans un contenu généré.
- Dans les réponses probables, ne fais participer aucun proche au travail du client si cette participation n'est pas déjà écrite dans le dossier.
- Phrases courtes. Ton direct et concret, sans flatterie ni enthousiasme.
- Jamais de tirets cadratins pour ponctuer une phrase.`;

/**
 * Ce que change le point de départ déclaré. Un client qui subit un problème
 * quotidien et un client qui arrive avec un cahier des charges ne doivent pas
 * lire les mêmes questions : le premier se ferme si on lui demande de choisir,
 * le second s'agace si on lui réexplique son propre projet.
 */
const OU_IL_EN_EST: Record<Maturite, string> = {
  idee: `Le projet part d'un problème quotidien, sans réponse déjà choisie. Pars du quotidien et de ce que le problème coûte. Ne demande jamais de trancher une question de fabrication, et ne présuppose aucune forme (site, application, automatisation) qui n'a pas été nommée.`,
  forme: `Une forme est déjà imaginée assez précisément. Tu peux interroger le parcours, les écrans et ce que voit chaque personne. Reste sans jargon, et fais préciser le POURQUOI de cette forme : c'est là qu'est le cadrage.`,
  specs: `Un document ou des exigences existent déjà. Va droit au but et ne fais pas raconter de nouveau ce qui est formulé. Cherche ce que le document ne dit pas : les arbitrages, le hors-périmètre et les contraintes tues.`,
};

function portrait(c: Contexte): string {
  const lignes = [`Client : ${c.nom}${c.metier ? `, ${c.metier}` : ''}.`];
  if (c.demande) lignes.push(`Sa demande de départ : « ${c.demande} ».`);
  if (c.maturite) lignes.push(`Point de départ déclaré : ${OU_IL_EN_EST[c.maturite]}`);

  const ecrits = Object.entries(c.reponses)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => a[0] - b[0]);

  if (ecrits.length) {
    lignes.push('', 'Ce que cette personne a déjà écrit, dans ses mots :');
    for (const [index, texte] of ecrits) {
      lignes.push(`- ${POINTS[index].num} — ${POINTS[index].label} : « ${texte} »`);
    }
  }

  if (c.brief?.trim()) {
    lignes.push('', 'Document ou notes qu\'il a déposés :', `"""${c.brief.trim().slice(0, 12_000)}"""`);
  }

  return lignes.join('\n');
}

// --------------------------------------------------------------- ouverture --

/**
 * Tout ce qui s'affiche à l'ouverture d'un point : la question, sa relance, et
 * les réponses probables. Un seul appel, parce que les trois doivent se tenir —
 * des réponses écrites pour une autre formulation de la question sonnent faux.
 *
 * Le point garde son intention (les huit possibles structurent le dossier) ; c'est
 * sa formulation qui s'ajuste au métier du client.
 */
export function promptOuverture(c: Contexte, point: Point): Message[] {
  const contrat = point.entretien;
  const axesSuivants = contrat.axesSuivants
    .map((axe) => `- ${axe}`)
    .join('\n');
  return [
    { role: 'system', content: VOIX },
    {
      role: 'user',
      content: `${portrait(c)}

Point ${point.num} — ${point.label}.
Résultat attendu à la fin de toute la section : ${point.intention}

Contrat de CE PREMIER TOUR uniquement : ${contrat.ouverture}.
Axes réservés à une éventuelle question suivante :
${axesSuivants || '- aucun'}

Reste strictement sur le contrat du premier tour. Ne cherche pas à couvrir les axes suivants dans la question ou dans chaque réponse proposée.

Formulation de référence, écrite pour un autre client : « ${point.q} »
Relance de référence : « ${point.hint} »

Écris pour CE client :
1. Une question d'une phrase directe, 15 mots maximum, adaptée à son métier.
2. Une relance de deux phrases courtes, 30 à 55 mots au total. La première aide à répondre concrètement. La seconde explique précisément ce que la réponse changera dans le périmètre, le parcours ou le devis.
3. Entre ${contrat.propositions.min} et ${contrat.propositions.max} réponses probables. Forme obligatoire : ${contrat.propositions.forme}. Chaque réponse fait au maximum ${contrat.propositions.maxMots} mots.
4. "choix" vaut exactement "${contrat.propositions.choix}".

Réponds "termine": false : au premier tour, on pose toujours la question.

Contraintes :
- La question et la relance vouvoient le client. Elles portent sur du concret : pas de "votre besoin", pas de "votre problématique". La question se termine par un point d'interrogation.
- La question ne contient ni préambule ni explication : toute précision utile va dans la relance.
- Chaque réponse répond directement à la question et se comprend seule.
- ${contrat.propositions.atomiques ? "Chaque réponse contient une seule idée : aucune liste de plusieurs actions, rôles, indicateurs ou décisions dans la même carte." : "Chaque réponse décrit un seul scénario cohérent, sans lui ajouter un second scénario."}
- Les réponses sont réellement différentes : pas de doublons, pas de reformulations d'une même idée et pas de carte « tout ce qui précède ».
- Les réponses probables n'ajoutent aucune personne, aucun lien familial et aucune collaboration qui ne figurent pas déjà dans le dossier.
- N'invente aucun nom de logiciel, chiffre, fréquence, cible, rôle ou comportement absent du dossier. Si une précision est inconnue, reste au niveau de la catégorie.
- Aucune ne contredit ce qu'il a déjà écrit.
- N'utilise pas le mot "solution" ni le mot "outil" en début de phrase.
- Ne transforme jamais une conséquence supposée en fait. Une proposition sert à se reconnaître, pas à compléter le dossier à la place du client.`,
    },
  ];
}

/**
 * La question de suite, écrite à partir de ce que le client vient de répondre.
 *
 * Le modèle ne prend qu'un axe manquant par tour. La plupart des points
 * peuvent donc être clos après une réponse précise ; seuls les contrats qui
 * comportent une vraie seconde décision imposent un deuxième tour.
 */
export function promptSuite(
  c: Contexte,
  point: Point,
  fil: Echange[],
  rang: number,
  doitContinuer: boolean,
): Message[] {
  const echanges = fil
    .map((e, i) => `Question ${i + 1} : « ${e.question} »\nSa réponse : « ${e.reponse} »`)
    .join('\n\n');
  const axesSuivants = point.entretien.axesSuivants
    .map((axe) => `- ${axe}`)
    .join('\n');
  const consignePriorisation =
    point.priorisation && rang === 1
      ? `
Pour cette deuxième question, ne cherche aucune autre information. Demande au client de classer les trois éléments qu'il vient de citer avec exactement ces labels :
- "Priorité 1 — à traiter en premier"
- "Priorité 2 — à traiter ensuite"
- "Priorité 3 — cruciale pour le projet"

Explique dans la relance, en deux phrases courtes, que la troisième priorité reste cruciale : le classement indique l'ordre d'attention, jamais qu'un élément serait facultatif. Chaque proposition doit être un classement complet des trois éléments et "choix" doit valoir "unique".`
      : '';
  const consigneContraintes =
    point.configurateur === 'contraintes'
      ? rang === 1
        ? `
Le premier échange est un configurateur qui a déjà demandé le délai, le budget et les demandes technologiques spécifiques.

Pour cette deuxième question :
- demande uniquement s'il existe d'autres contraintes non classiques que ces trois catégories n'ont pas couvertes ;
- donne comme pistes un circuit de validation interne, une règle métier ou légale, une dépendance extérieure, une exigence d'accessibilité ou une autorisation à obtenir ;
- ne redemande jamais le délai, le budget ou les technologies ;
- "termine" doit valoir false.`
        : `
Le délai, le budget et les demandes technologiques ont déjà été traités par le configurateur, même si le client y a écrit « à définir » ou « aucune ». Ne les redemande jamais.

Après la deuxième réponse, ne continue que si le client a réellement exprimé une contrainte non classique dont une conséquence concrète reste ambiguë. S'il répond qu'il n'en existe aucune, ou si celle qu'il donne est assez précise pour le chiffrage, réponds "termine": true.`
      : '';

  return [
    { role: 'system', content: VOIX },
    {
      role: 'user',
      content: `${portrait(c)}

Point ${point.num} — ${point.label}.
Ce que ce point doit établir : ${point.intention}

Ce qui s'est dit sur ce point :

${echanges}

Axes complémentaires autorisés, à traiter au maximum un par question :
${axesSuivants || '- aucun'}

Décide d'abord si le point est assez précis pour cadrer et chiffrer honnêtement. Une réponse courte peut suffire si elle tranche déjà l'essentiel.

${
  doitContinuer
    ? `Le contrat de cette section impose encore une réponse. Tu dois poser la question ${
        rang + 1
      } et répondre "termine": false. Choisis un seul axe complémentaire autorisé qui n'a pas encore de réponse.`
    : `Le minimum propre à cette section est atteint. Réponds "termine": true si l'information obtenue permet une décision de périmètre ou de devis. Sinon, réponds "termine": false et demande un seul détail encore nécessaire.`
}
${consignePriorisation}
${consigneContraintes}

Quand le minimum est atteint, ne pose une question de suite QUE si l'un de ces cas est vrai :
- il manque un fait, un chiffre ou un ordre de grandeur qui change le périmètre ou le chiffrage ;
- sa réponse ouvre plusieurs directions réellement différentes et il faut savoir laquelle retenir ;
- il a répondu à côté, par une généralité, ou d'une façon contradictoire avec le reste du dossier ;
- une conséquence importante de sa réponse reste ambiguë et doit être clarifiée avant de construire.

N'en pose PAS pour :
- approfondir par curiosité, ou par symétrie avec les autres points ;
- lui faire confirmer ce qu'il vient de dire ;
- demander quelque chose qu'un autre point demandera de toute façon.
- compléter tous les axes de la section alors que ceux qui manquent ne changent aucune décision.

Si tu poses la question ${rang + 1} :
- elle traite un seul axe manquant, part de SES mots, tient en une phrase directe de 15 mots maximum et se répond en une phrase ;
- elle ne contient ni préambule ni explication ;
- elle ne redemande rien de ce qui est écrit plus haut ;
- "relance" contient deux phrases courtes et 30 à 55 mots au total : la première aide à répondre, la seconde dit concrètement ce que cette précision changera ;
- propose trois ou quatre réponses courtes, à la première personne, avec une seule idée par carte et 22 mots maximum ;
- chaque proposition répond directement à cette nouvelle question ; aucune ne regroupe plusieurs actions, rôles, indicateurs ou décisions ;
- les propositions utilisent uniquement des faits déjà écrits ou des catégories neutres : aucun proche, collaborateur, logiciel, chiffre, cible ou comportement inventé ;
- "choix" vaut "unique", sauf instruction spéciale explicite ci-dessus.`,
    },
  ];
}

// ---------------------------------------------------- hors périmètre ---- //

/**
 * Décide si le point VI existe pour ce dossier. Il ne suffit pas qu'une
 * fonctionnalité soit courante ou plausible : le besoin doit avoir été écrit.
 */
export function promptDecisionHorsPerimetre(c: Contexte): Message[] {
  return [
    { role: 'system', content: VOIX },
    {
      role: 'user',
      content: `${portrait(c)}

Le client a défini, classé ou fourni dans son document ses trois priorités principales.

Doit-on lui afficher une partie « Hors périmètre » ?

Réponds "afficher": true UNIQUEMENT s'il a explicitement évoqué un besoin, une fonctionnalité ou une attente supplémentaire qui ne figure pas dans ses trois priorités classées, et sur lequel il faut décider : l'intégrer à la première version, le reporter ou l'écarter.

Réponds "afficher": false dans tous les autres cas, notamment :
- il a seulement donné et classé ses trois priorités ;
- tu imagines une fonctionnalité habituelle dans son métier, mais il ne l'a pas nommée ;
- une contrainte, un utilisateur ou un objectif est déjà traité par un autre point ;
- tu voudrais poser une question par prudence ou pour compléter le plan.

"besoin" recopie en quelques mots le besoin supplémentaire réellement exprimé. Il doit rester vide si "afficher" vaut false. N'invente jamais un besoin pour remplir cette partie.`,
    },
  ];
}

// ----------------------------------------------------------- reformulation --

/**
 * « Si je comprends bien : … ». Le client va l'accepter ou la refuser, donc
 * elle doit ajouter de la précision, pas répéter ses mots.
 */
export function promptReformulation(c: Contexte, point: Point, reponse: string): Message[] {
  return [
    { role: 'system', content: VOIX },
    {
      role: 'user',
      content: `${portrait(c)}

Point ${point.num} — ${point.label}.
Question posée : « ${point.q} »
Ce que le client vient d'écrire : « ${reponse} »

Écris la reformulation que Nicolas lui soumettra pour validation, à la suite de « Si je comprends bien : ».

Contraintes :
- Commence par une minuscule (la phrase suit « Si je comprends bien : »).
- Une seule phrase, deux au maximum.
- Elle doit RESSERRER : nommer l'enjeu réel, faire ressortir un chiffre déjà donné, ou expliciter une conséquence directement contenue dans la réponse. Ne te contente pas de répéter.
- Elle ne doit contenir aucun fait absent de ce qu'il a écrit. Si sa réponse est déjà précise et factuelle, resserre malgré tout sans rien ajouter.
- Tu t'adresses à lui : "vous".`,
    },
  ];
}

// ----------------------------------------------------------------- tension --

/**
 * La contradiction entre deux réponses. C'est la valeur la plus rare de
 * l'entretien : personne ne relit ses propres réponses en cherchant les
 * incohérences. Le modèle ne doit en signaler que de vraies.
 */
export function promptTension(c: Contexte, point: Point, reponse: string): Message[] {
  return [
    { role: 'system', content: VOIX },
    {
      role: 'user',
      content: `${portrait(c)}

Point ${point.num} — ${point.label}.
Ce que le client vient d'écrire : « ${reponse} »

Cette réponse contredit-elle VRAIMENT quelque chose qu'il a écrit avant ?

Une vraie tension, c'est deux exigences qui ne peuvent pas tenir ensemble sans arbitrage, et dont l'arbitrage change ce qu'on construit. Exemple : des utilisateurs peu à l'aise avec le numérique d'un côté, une saisie détaillée exigée d'eux de l'autre.

Ce n'est PAS une tension :
- une simple imprécision ou un manque de détail,
- deux besoins qui coûtent cher mais coexistent,
- une réponse à laquelle il manque une information.

S'il n'y a pas de contradiction franche, réponds tension = false et laisse les autres champs vides. C'est le cas le plus fréquent : n'en invente pas.

Si tension il y a :
- "explication" : deux à trois phrases. Rappelle ce qu'il avait dit, ce qu'il dit maintenant, et pourquoi il faut trancher. Tu t'adresses à lui.
- "optionA" et "optionB" : les deux arbitrages possibles, en cinq à huit mots chacun, formulés comme des libellés de bouton (ex : « La simplicité passe d'abord »).`,
    },
  ];
}

// -------------------------------------------------------------------- aide --

/**
 * « Je ne sais pas, aidez-moi ». Chaque piste dit sa conséquence sur le projet :
 * c'est ce qui transforme une question embarrassante en décision éclairée.
 */
export function promptAide(c: Contexte, point: Point): Message[] {
  return [
    { role: 'system', content: VOIX },
    {
      role: 'user',
      content: `${portrait(c)}

Point ${point.num} — ${point.label}.
Question posée : « ${point.q} »

La personne a répondu « je ne sais pas ». Propose trois pistes parmi lesquelles elle peut se reconnaître, sans compléter sa situation à sa place.

Pour chaque piste :
- "texte" : la piste écrite à la première personne, comme une réponse orale. Une phrase.
- "effet" : la conséquence concrète sur le projet si cette piste est retenue. Commence par « Conséquence : ». Une phrase. Dis un vrai arbitrage (coût, délai, périmètre, ordre des travaux), pas une généralité.
- une piste contient une seule idée et 22 mots maximum ;
- n'invente aucun rôle, proche, logiciel, canal, chiffre, fréquence ou comportement absent du dossier ;
- si les faits manquent, propose une catégorie neutre à confirmer, jamais un faux exemple précis.

Écris aussi "titre" : une phrase courte qui explique ce que les trois pistes permettent de décider. Ne prétends jamais que Nicolas accompagne habituellement ce métier et n'utilise aucune statistique inventée.`,
    },
  ];
}

// ---------------------------------------------------------------- déduction --

/** Ce qu'on peut poser sans le demander — signalé comme déduit, jamais fondu
 *  dans les mots du client. */
export function promptDeduction(c: Contexte, point: Point, reponse: string): Message[] {
  return [
    { role: 'system', content: VOIX },
    {
      role: 'user',
      content: `${portrait(c)}

Point ${point.num} — ${point.label}.
Ce que le client vient d'écrire : « ${reponse} »

Y a-t-il quelque chose d'important pour le chiffrage qui découle directement de sa réponse et qu'on peut poser comme hypothèse explicite plutôt que de demander une confirmation de plus ?

Ce doit être une hypothèse que la personne pourra contredire d'un coup d'œil et qui change le devis. Exemple de forme : « Le système existant reste inchangé et la première version n'échange aucune donnée avec lui. » Cette forme n'est valable que si la réponse établit réellement ces deux faits.

S'il n'y a rien de solide à déduire, réponds deduction = false. C'est fréquent.

Si oui, "texte" : une à deux phrases, affirmatives, à la troisième personne (on décrit le projet, pas le client).`,
    },
  ];
}

// ---------------------------------------------------------------- analyse --

/**
 * La lecture du document déposé : quels points utiles sont déjà couverts,
 * lesquels manquent. C'est ce qui fait tenir la promesse du chemin rapide.
 */
export function promptAnalyse(c: Contexte): Message[] {
  const sommaire = POINTS.map((p, k) => `${k}. ${p.num} — ${p.label} : ${p.q}`).join('\n');

  return [
    { role: 'system', content: VOIX },
    {
      role: 'user',
      content: `${portrait(c)}

Voici les huit points possibles d'un cadrage :
${sommaire}

Lis le document déposé et dis, pour chacun des huit points possibles, s'il est couvert.

Exception absolue pour le point VI « Le hors-périmètre » :
- s'il n'existe dans le document AUCUN besoin supplémentaire hors des trois priorités, considère ce point non applicable : "couvert": true, avec "extrait", "reponse" et "manque" vides. Il ne sera pas affiché ;
- si un besoin supplémentaire est explicitement cité mais qu'aucune décision ne dit s'il faut l'intégrer, le reporter ou l'écarter, alors seulement marque ce point non couvert et explique la décision manquante ;
- n'invente jamais un besoin supplémentaire parce que le document ne dit pas ce que le projet ne fera pas.

Pour un point COUVERT :
- "index" : son numéro dans la liste (0 à 7)
- "couvert" : true
- "extrait" : la phrase du document qui le couvre, recopiée mot pour mot, tronquée à 150 caractères. Jamais reformulée.
- "reponse" : ce point rédigé comme une réponse du client, à la première personne, à partir du document uniquement. C'est ce qui sera versé au dossier : n'y mets rien que le document ne dise.

Pour un point NON COUVERT :
- "couvert" : false
- "extrait" et "reponse" : chaînes vides
- "manque" : une phrase disant ce qui manque et pourquoi ça compte pour le devis. Tu t'adresses au client.

Sois exigeant : un point n'est couvert que si le document répond vraiment à la question, pas s'il l'effleure.`,
    },
  ];
}
