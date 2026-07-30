# client-freelance

Cadrage — l'entretien que remplit un client avant le premier rendez-vous, pour
que le chiffrage parte d'un dossier écrit plutôt que d'un appel.

Sept points systématiques et un point conditionnel. Une réponse précise suffit
sur la plupart des points ; le périmètre et les contraintes gardent un second
tour parce qu'ils portent une décision distincte. Toute question suivante est
écrite à partir de la réponse précédente et d'un seul axe encore manquant.
La partie « Hors périmètre » n'existe que si le client a lui-même évoqué un
besoin supplémentaire. Le client écrit avec ses mots ou clique parmi des
réponses probables — une seule ou plusieurs, selon ce que la question appelle.
L'outil reformule et fait valider, relève les contradictions, et produit un
récapitulatif où l'on distingue toujours ce que le client a dit, ce qu'il a
validé, et ce qui a été déduit sans lui.

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + bundle dans dist/
```

## Les écrans

Les adresses principales :

| Adresse | Qui l'ouvre |
| --- | --- |
| `/` | Un visiteur venu du site de Nicolas. Il découvre le cadrage et choisit de commencer. |
| `/commencer` | Le formulaire public qui recueille les quatre renseignements nécessaires avant la première question. |
| `/?c=<jeton>` | Le client, sur son dossier. |
| `/demo` | Une démonstration sur les textes de la maquette, avec le sélecteur « Parcours ». |
| `/prestataire` | Le tableau de bord, protégé par le jeton d'administration. |

Le sélecteur « Parcours », en bas à droite de `/demo`, donne accès à tous les
états, y compris ceux qu'on n'atteint pas en jouant l'entretien dans l'ordre. Il
ne s'affiche nulle part ailleurs : un visiteur ne doit jamais lire le dossier
d'un client de démonstration en croyant que c'est le sien.

| Écran | Fichier | Rôle |
| --- | --- | --- |
| Page publique | `src/screens/Landing.tsx` | Ce qu'est le cadrage et l'appel à commencer |
| Formulaire public | `src/screens/Inscription.tsx` | Les renseignements de départ, sur une page séparée |
| Point de départ | `src/screens/Depart.tsx` | Où en est le client : la question qui précède le cadrage |
| Accueil | `src/screens/Accueil.tsx` | Entrée du client invité, et les deux raccourcis |
| Entretien | `src/screens/Entretien.tsx` | La question en cours, le sommaire, l'aide et l'arbitrage |
| Reformulation | `src/screens/Reformulation.tsx` | « Si je comprends bien : … », à confirmer avant d'avancer |
| Chemin rapide | `src/screens/Rapide.tsx` | Dépôt d'un cahier des charges, lu par le modèle, et ce qu'il manque |
| Récapitulatif | `src/screens/Recap.tsx` | Le dossier relu et validé par le client |
| Fin | `src/screens/Fin.tsx` | Accusé de transmission |
| Reprise | `src/screens/Reprise.tsx` | Retour après interruption |
| Déroulé | `src/screens/Deroule.tsx` | Coulisses : ce que la machine fait de chaque réponse |
| Prestataire | `src/screens/Dashboard.tsx` | Les cadrages en cours, côté Studio Cazals |

## Où se trouve quoi

- `shared/points.ts` — les huit points possibles, dont un conditionnel et un
  configurateur. Chacun porte une **intention**, un contrat de génération et
  une formulation de référence avec des réponses de démonstration. Sur un
  dossier réel, les réponses d'un autre métier ne servent jamais de repli.
  C'est la structure du dossier : la retoucher change ce qui est garanti
  couvert. Partagé avec le serveur.
- `shared/api.ts` — le contrat entre navigateur et serveur, défini une fois.
- `src/state.ts` — la machine à états : navigation, brouillon, arbitrage,
  validation des reformulations.
- `src/usePersistance.ts` — l'enregistrement au fil de l'eau : n'envoie que ce
  qui a changé, après un demi-seconde de silence.
- `src/styles.css` — les jetons de la maquette et toutes les règles d'écran.
- `src/App.tsx` — le montage, le thème et la couleur d'accent.
- `server/src/` — Fastify, SQLite (`node:sqlite`, sans dépendance native),
  routes client et prestataire, plus les tests.

`<Cadrage>` accepte trois réglages : `theme` (`auto` | `clair` | `sombre`),
`accent` (couleur de marque, éclaircie automatiquement en thème sombre) et
`afficherPlan`, qui n'a d'effet que sur `/demo`.

## Ouvrir un cadrage sans invitation

`POST /api/cadrage` est la seule route publique en écriture : elle crée le
cadrage et rend le lien. C'est ce que fait le formulaire de `/commencer`.

La première chose demandée n'est pas dans ce formulaire : **où le client en
est** est la question qui ouvre l'entretien (`src/screens/Depart.tsx`), avant
les points du cadrage. C'est une question, pas un renseignement, et sa réponse part
dans le contexte de chaque génération.

| Choix | Ce que ça change |
| --- | --- |
| `idee` — sait ce qui le gêne, pas comment le régler | Questions ancrées dans son quotidien, aucune décision de fabrication à prendre, aucune forme présupposée |
| `forme` — a une idée précise de ce qu'il veut | On peut parler parcours et écrans, en cherchant le pourquoi derrière ce qu'il imagine |
| `specs` — a déjà un cahier des charges | Va directement au dépôt de document, et l'entretien cherche ce que le document tait |

Elle est posée avant que le point I ne soit rédigé : son ouverture est mise en
cache une fois pour toutes, la poser après la figerait sans elle. Un client qui
revient sans y avoir répondu la retrouve.

Elle est ouverte à tous, et chaque cadrage ouvre un entretien que le modèle
facture. Deux bornes, dans `server/src/routes/inscription.ts` :

- **trois ouvertures par heure et par connexion**, comptées sur une empreinte
  salée de l'adresse IP — l'adresse elle-même n'est jamais écrite en base ;
- **soixante par jour**, toutes connexions confondues. Au-delà, le visiteur est
  renvoyé vers l'adresse de Nicolas plutôt que devant une page morte.

Le formulaire n'affiche pas d'écran de confirmation : il pose le jeton dans
l'URL avec `replaceState` puis entre directement dans la première question. Le
visiteur a déjà cliqué une fois, on ne lui redemande pas de cliquer sur son
propre lien — qui reste dans la barre d'adresse, prêt à être mis en favori.

Le courriel saisi est visible dans le tableau du prestataire pour permettre le
contact, mais **aucun message automatique n'est promis ni envoyé**. Le lien
reste donc le moyen de reprise du client tant qu'une intégration de messagerie
n'est pas configurée.

`trustProxy` est activé côté Fastify : derrière le Caddy mutualisé, sans lui
toutes les requêtes porteraient l'adresse du proxy et la limite vaudrait pour
tout le monde à la fois.

## Le modèle

L'entretien est conduit par **`qwen/qwen3.7-plus`** via OpenRouter. Huit
capacités, toutes côté serveur — la clé ne touche jamais le navigateur :

| Capacité | Ce qu'elle remplace |
| --- | --- |
| Ouverture | La question, sa relance et les réponses probables, écrites pour le métier du client |
| Suite | La question suivante sur le même point, tirée de ce qu'il vient de répondre |
| Reformulation | « Si je comprends bien : … », tirée de ce qu'il a écrit |
| Tension | La contradiction entre deux réponses, avec l'arbitrage proposé |
| Aide | Trois pistes et leur conséquence chiffrée sur le projet |
| Déduction | Ce qu'on peut poser sans le demander |
| Décision hors périmètre | Si un besoin supplémentaire explicite justifie d'afficher le point VI |
| Analyse | Quels points utiles un document déposé couvre déjà |

Deux partis pris, mesurés :

- **Le raisonnement est désactivé.** Sur ces générations courtes et contraintes
  il coûtait 2 945 tokens pour trois phrases, dix-neuf fois le prix, sans gain
  de qualité. Un entretien complet revient à quelques centimes.
- **Sortie en JSON strict.** Le serveur ne lit jamais de prose : ce qui n'entre
  pas dans le schéma est un échec, pas une surprise.

Tout est mis en cache dans la table `generation`, par empreinte de l'entrée : un
client qui recharge revoit les mêmes propositions, et une réponse réécrite
regénère sa reformulation. Deux requêtes pour la même génération se croisent
facilement — le préchargement et l'ouverture réelle d'un point : la seconde
attend la première au lieu de payer un second appel. Le récapitulatif lit ce cache plutôt que la mémoire
de l'onglet : le document livré cite la reformulation du client, y compris
après un rechargement.

**Sans clé, l'application marche.** Elle conserve les questions neutres et les
étapes déterministes, mais masque les réponses probables, reformulations et
déductions écrites pour le cas de démonstration. Chaque repli est tracé dans le
journal (`[generation] repli sur …`) : une dégradation silencieuse serait une
panne invisible.

Un repli n'est normalement jamais mis en cache : il ne fige pas une version
dégradée, mais il ne survit pas non plus au rechargement. Seule la décision de
masquer le hors-périmètre est conservée même sans modèle, car elle détermine la
navigation et doit rester stable. Sur un dossier réel, le récapitulatif préfère
n'afficher aucune reformulation plutôt que celle d'un autre client.

Réglages : `CADRAGE_OPENROUTER_KEY`, `CADRAGE_MODELE`,
`CADRAGE_LLM_TIMEOUT`, `CADRAGE_MAX_GENERATIONS_HOUR`.

Le chemin rapide extrait le texte des fichiers texte, PDF et Word `.docx`.
Images et tableurs restent disponibles au prestataire mais sont signalés comme
non lus. Une analyse dégradée ne couvre jamais un point par défaut. Les
synthèses vérifiées sont versées au dossier uniquement après le clic du client,
avec la provenance `document` plutôt que comme une fausse citation.

## Le fil d'un point

Chaque point possède son propre contrat : l'axe du premier tour, les axes
complémentaires autorisés, la forme de ses réponses probables et son nombre
minimal de réponses. Le modèle continue seulement si une précision change
encore le périmètre ou le chiffrage :

- **Une réponse précise suffit généralement.** Le classement du périmètre et
  la recherche des contraintes atypiques restent de vraies secondes étapes,
  garanties même sans clé LLM.
- **Il n'y a pas de plafond arbitraire.** Le modèle peut poser autant de
  questions utiles que nécessaire.
- **Le client garde la main** sur une question de suite avec « Passer à l'étape
  suivante ». Sa réponse en cours est enregistrée avant le passage.
- **Le modèle ferme dès que le point est établi.** Il ne relance pas par
  curiosité, pour faire confirmer une réponse, ni pour anticiper un autre point.
- **Les réponses probables sont contrôlées par le serveur.** Les cartes trop
  longues, redondantes, fourre-tout ou contenant un proche ou collaborateur
  inventé sont régénérées une fois, puis remplacées par un champ libre neutre.

Le point VI suit une règle plus stricte : à la clôture du périmètre, une
génération dédiée recherche un besoin supplémentaire explicitement formulé.
Sans ce besoin, le point est masqué dans le sommaire, sauté dans la navigation,
absent du récapitulatif et jamais préchargé. En cas de doute ou d'absence du
modèle, la décision est toujours de le masquer.

Le point VII commence par un configurateur déterministe : délai, budget et
demandes technologiques spécifiques. Sa réponse est versée dans le même fil que
les réponses libres. Le tour suivant revient à l'IA, avec une consigne ciblée :
chercher seulement les contraintes non classiques encore absentes, sans
redemander les trois champs.

Une relance ne coûte **aucune attente supplémentaire** : la question de suite
voyage dans la réponse du `PUT`, et tant que le fil continue, reformulation,
contradiction et déduction ne sont pas calculées. Un échange intermédiaire coûte
donc une génération au lieu de trois.

Le dossier ne change pas de forme : `reponse.texte` rassemble les réponses du
fil, une par ligne, et tout ce qui lit le dossier — récapitulatif, tableau de
bord, analyse — continue de lire ce seul champ. Le fil lui-même vit dans la
table `echange`, avec les questions telles qu'elles ont été posées.

**Mode court** : chaque point s'arrête dès que son minimum propre est atteint,
sans relance supplémentaire. C'est la soupape.

## L'attente

Écrire un point pour un métier prend quatre à six secondes, lire un document
déposé une quinzaine. Une règle, tenue partout :

> Ce qui est connu s'affiche tout de suite ; ce qui est écrit pour ce client
> n'apparaît qu'écrit ; les textes de la maquette sont un repli de panne, jamais
> un écran d'attente.

- **Rien ne s'affiche à la place du contenu attendu** — ni la question, ni les
  trois pistes d'aide, ni la couverture d'un document. Les montrer d'abord
  ferait lire une question, puis la verrait remplacée par une autre. Le point
  garde son numéro et son intitulé, les fichiers déposés restent listés : c'est
  connu, ça n'attend rien.
- **Un seul bloc d'attente** (`src/components/Attente.tsx`), avec une barre
  réglée sur la durée observée. Elle s'arrête à 92 % : la fin appartient au
  modèle, pas à l'animation, et sous `prefers-reduced-motion` elle disparaît
  plutôt que de rester figée à zéro.
- **Un repli va toujours avec un écran d'attente.** Deux essais ont lieu, puis
  la question neutre de référence s'affiche avec un champ libre, sans réponses
  probables empruntées à la démonstration. Sans ça, une coupure réseau laisse
  le client devant une attente sans fin.
- **Le point suivant s'écrit pendant la reformulation.** Le serveur le lance dès
  qu'il a enregistré la réponse, sans attendre d'être interrogé ; le navigateur
  le redemande à la réception et tombe sur la génération déjà en cours. Le
  client lit « Si je comprends bien : … » pendant ce temps et n'attend vraiment
  qu'une fois, au premier point.

## Déploiement

En production : <https://client-contact.duckdns.org>

Une seule image (`Dockerfile`) : Fastify sert l'API **et** le build Vite. Le TLS
et le routage sont assurés par le Caddy mutualisé du VPS — cette stack ne publie
aucun port sur l'hôte, elle rejoint le réseau du proxy sous l'alias
`client-contact-web`.

```bash
# En local, si Docker est disponible
CADRAGE_ADMIN_TOKEN=... docker compose -f docker-compose.prod.yml up --build
```

### Pipeline

| Workflow | Déclencheur | Rôle |
| --- | --- | --- |
| `.github/workflows/ci.yml` | toute branche, PR | types, tests serveur, build front, build de l'image |
| `.github/workflows/deploy-vps.yml` | `main`, manuel | rejoue les vérifications, puis déploie |

Le déploiement suit le motif des autres projets du VPS : rsync vers
`~/client-freelance/releases/<sha>`, bascule du symlink `current`,
`docker compose up -d --build`, purge au-delà de cinq releases, puis contrôle
que `/api/sante` répond.

**Secrets GitHub à définir** (Settings → Secrets → Actions) :

| Secret | Valeur |
| --- | --- |
| `VPS_HOST` | `51.210.109.16` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_PRIVATE_KEY` | contenu de `~/.ssh/id_ed25519_ovh_deploy` |

### Sur le VPS

- `~/client-freelance/shared/.env` contient `CADRAGE_ADMIN_TOKEN`. Il n'est
  jamais dans le dépôt et est copié dans chaque release avant le démarrage.
- La base SQLite et les fichiers déposés vivent dans le volume
  `client-freelance_data`, monté sur `/data` : ils survivent aux déploiements.
- Une sauvegarde SQLite à chaud et une copie des fichiers sont créées au
  démarrage puis chaque jour dans `client-freelance_backups`. Les quatorze
  dernières sont conservées. Ce second volume doit lui-même être copié hors du
  VPS pour couvrir la perte complète de la machine.
- La route HTTPS est déclarée dans `~/qr-compose.prod.yml` (stack `qr-code`) :

  ```
  client-contact.duckdns.org {
    reverse_proxy client-contact-web:8787
  }
  ```

  Ce fichier est partagé avec huit autres sites. Après l'avoir modifié,
  préférer un rechargement à chaud — Caddy valide la configuration avant de
  l'appliquer et conserve l'ancienne en cas d'erreur — plutôt que de recréer le
  conteneur :

  ```bash
  docker exec qr_caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  ```

### Tableau de bord du prestataire

Sur `/prestataire`, ou via le sélecteur « Parcours » de `/demo`. Il demande le jeton d'administration au premier accès et le garde
dans le `localStorage` — jamais dans une URL.

## Reste à faire

- **Notification.** Le courriel est exploitable depuis le tableau, mais aucune
  notification de nouveau dossier ni copie automatique n'est envoyée.
- **Rétention.** Le prestataire peut supprimer un dossier actif et ses fichiers
  depuis le tableau ; ses copies expirent avec la rotation des sauvegardes,
  fixée à quatorze jours en production. Une durée d'expiration automatique des
  dossiers actifs reste à décider métier avant toute suppression sans action
  humaine.
- **Sauvegarde hors site.** La rotation quotidienne protège le volume
  principal, pas la perte totale du VPS : répliquer
  `client-freelance_backups` vers un autre hébergeur reste une tâche
  d'exploitation.
- **Écran « Déroulé ».** Il illustre le mécanisme avec les réponses probables
  et n'est pas branché sur un dossier réel — c'est une vue de démonstration.

## Maquette d'origine

`design/Cadrage.dc.html` est le prototype Claude Design dont ce code est
l'implémentation, avec son runtime `design/support.js`. Il sert de référence
pour les intentions visuelles ; il n'est pas construit ni servi par Vite.
