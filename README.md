# client-freelance

Cadrage — l'entretien que remplit un client avant le premier rendez-vous, pour
que le chiffrage parte d'un dossier écrit plutôt que d'un appel.

Huit points, un court échange sur chacun : la question suivante est écrite à
partir de la réponse précédente, jusqu'à trois par point. Le client écrit avec
ses mots ou clique parmi des réponses probables — une seule ou plusieurs, selon
ce que la question appelle. L'outil reformule et fait valider, relève les
contradictions, et produit un récapitulatif où l'on distingue toujours ce que le
client a dit, ce qu'il a validé, et ce qui a été déduit sans lui.

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + bundle dans dist/
```

## Les écrans

Quatre adresses, et rien d'autre :

| Adresse | Qui l'ouvre |
| --- | --- |
| `/` | Un visiteur venu du site de Nicolas. Il se présente, dit où il en est, et entre dans l'entretien. |
| `/?c=<jeton>` | Le client, sur son dossier. |
| `/demo` | Une démonstration sur les textes de la maquette, avec le sélecteur « Parcours ». |
| `/prestataire` | Le tableau de bord, protégé par le jeton d'administration. |

Le sélecteur « Parcours », en bas à droite de `/demo`, donne accès à tous les
états, y compris ceux qu'on n'atteint pas en jouant l'entretien dans l'ordre. Il
ne s'affiche nulle part ailleurs : un visiteur ne doit jamais lire le dossier
d'un client de démonstration en croyant que c'est le sien.

| Écran | Fichier | Rôle |
| --- | --- | --- |
| Page publique | `src/screens/Landing.tsx` | Ce qu'est le cadrage, et le formulaire qui l'ouvre |
| Point de départ | `src/screens/Depart.tsx` | Où en est le client : la question qui précède les huit points |
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

- `shared/points.ts` — les huit points. Chacun porte une **intention** (ce que
  le point doit établir, jamais réécrite) et une formulation de référence
  (question, relance, réponses probables) qui sert de repli quand le modèle est
  absent. C'est la structure du dossier : la retoucher change ce qui est
  garanti couvert. Partagé avec le serveur.
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
cadrage et rend le lien. C'est ce que fait le formulaire de `/`.

La première chose demandée n'est pas dans ce formulaire : **où le client en
est** est la question qui ouvre l'entretien (`src/screens/Depart.tsx`), avant
les huit points. C'est une question, pas un renseignement, et sa réponse part
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

Le courriel saisi est conservé, mais **rien ne part encore** : si le client
perd l'adresse de son onglet, il perd son dossier.

`trustProxy` est activé côté Fastify : derrière le Caddy mutualisé, sans lui
toutes les requêtes porteraient l'adresse du proxy et la limite vaudrait pour
tout le monde à la fois.

## Le modèle

L'entretien est conduit par **`qwen/qwen3.7-plus`** via OpenRouter. Six
capacités, toutes côté serveur — la clé ne touche jamais le navigateur :

| Capacité | Ce qu'elle remplace |
| --- | --- |
| Ouverture | La question, sa relance et les réponses probables, écrites pour le métier du client |
| Suite | La question suivante sur le même point, tirée de ce qu'il vient de répondre |
| Reformulation | « Si je comprends bien : … », tirée de ce qu'il a écrit |
| Tension | La contradiction entre deux réponses, avec l'arbitrage proposé |
| Aide | Trois pistes et leur conséquence chiffrée sur le projet |
| Déduction | Ce qu'on peut poser sans le demander |
| Analyse | Quels points des huit un document déposé couvre déjà |

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

**Sans clé, l'application marche.** Elle retombe sur les contenus écrits de la
maquette — moins ajustés, jamais interrompus. Chaque repli est tracé dans le
journal (`[generation] repli sur …`) : une dégradation silencieuse serait une
panne invisible.

Un repli n'est jamais mis en cache : il ne fige pas une version dégradée, mais
il ne survit pas non plus au rechargement. Sur un dossier réel, le
récapitulatif préfère alors n'afficher aucune reformulation plutôt que celle
d'un autre client.

Réglages : `CADRAGE_OPENROUTER_KEY`, `CADRAGE_MODELE`, `CADRAGE_LLM_TIMEOUT`.

## Le fil d'un point

Un point n'est plus une question mais **jusqu'à trois**, chacune écrite à partir
de la réponse précédente. Trois garde-fous, parce que c'est là que ce genre
d'outil devient bavard :

- **Le plafond est tenu par le code, pas par le modèle** (`RANG_MAX` dans
  `server/src/repo.ts`). Au troisième échange le point se ferme, quoi qu'en dise
  la génération.
- **Le client peut couper court** dès la deuxième question : « c'est bon pour ce
  point ».
- **Le modèle doit fermer par défaut.** Sa consigne : ne relancer que s'il
  manque un ordre de grandeur, si la réponse ouvre deux directions
  incompatibles, ou si elle pourrait être celle de n'importe qui. Sans clé, il
  n'y a aucune relance — un repli n'invente jamais une question de plus.

Une relance ne coûte **aucune attente supplémentaire** : la question de suite
voyage dans la réponse du `PUT`, et tant que le fil continue, reformulation,
contradiction et déduction ne sont pas calculées. Un échange intermédiaire coûte
donc une génération au lieu de trois.

Le dossier ne change pas de forme : `reponse.texte` rassemble les réponses du
fil, une par ligne, et tout ce qui lit le dossier — récapitulatif, tableau de
bord, analyse — continue de lire ce seul champ. Le fil lui-même vit dans la
table `echange`, avec les questions telles qu'elles ont été posées.

**Mode court** : aucune relance, une question par point. C'est la soupape.

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
- **Un repli va toujours avec un écran d'attente.** Depuis que les textes de
  référence ne servent plus de patience, ils doivent servir de panne : deux
  essais, puis le contenu de la maquette. Sans ça, une coupure réseau laisse le
  client devant une attente sans fin.
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

- **PDF et Word.** Seuls le texte collé et les fichiers texte sont lus. Les
  binaires sont nommés au client sur l'écran de dépôt (« je n'ai pas pu lire
  *devis.pdf* ») plutôt qu'ignorés en silence, mais leur contenu n'entre pas
  dans l'analyse. Le modèle accepte les images : une extraction PDF reste à
  ajouter. C'est le manque le plus visible du chemin rapide, puisque la plupart
  des cahiers des charges arrivent en PDF.
- **Courriel.** Rien n'est envoyé nulle part. Le récapitulatif promet « vous
  recevrez une copie par courriel », et l'ouverture en libre-service collecte
  une adresse sans jamais s'en servir : le client qui perd son lien perd son
  dossier, et Nicolas n'est pas prévenu qu'un cadrage s'est ouvert. C'est le
  manque le plus visible depuis que la page publique existe.
- **« C'est juste ».** Sur les blocs *déduit*, ce bouton n'enregistre pas
  l'accord du client (« Corriger » renvoie bien au point). Il faudrait un champ
  par déduction, comme `confirme` pour les reformulations.
- **Sauvegarde.** Le volume `client-freelance_data` n'est ni sauvegardé ni
  répliqué. Une perte du VPS emporte les cadrages en cours.
- **Rétention.** Aucun lien n'expire ; les fichiers déposés restent
  indéfiniment.
- **Écran « Déroulé ».** Il illustre le mécanisme avec les réponses probables
  et n'est pas branché sur un dossier réel — c'est une vue de démonstration.

## Maquette d'origine

`design/Cadrage.dc.html` est le prototype Claude Design dont ce code est
l'implémentation, avec son runtime `design/support.js`. Il sert de référence
pour les intentions visuelles ; il n'est pas construit ni servi par Vite.
