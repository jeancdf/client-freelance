# client-freelance

Cadrage — l'entretien que remplit un client avant le premier rendez-vous, pour
que le chiffrage parte d'un dossier écrit plutôt que d'un appel.

Huit points, une question à la fois. Le client écrit avec ses mots ou choisit
parmi des réponses probables ; l'outil reformule et fait valider, relève les
contradictions, et produit un récapitulatif où l'on distingue toujours ce que le
client a dit, ce qu'il a validé, et ce qui a été déduit sans lui.

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + bundle dans dist/
```

## Les écrans

Le sélecteur « Parcours », en bas à droite, donne accès à tous les états, y
compris ceux qu'on n'atteint pas en jouant l'entretien dans l'ordre.

| Écran | Fichier | Rôle |
| --- | --- | --- |
| Accueil | `src/screens/Accueil.tsx` | Entrée, et les deux raccourcis (version courte, dépôt de document) |
| Entretien | `src/screens/Entretien.tsx` | La question en cours, le sommaire, l'aide et l'arbitrage |
| Reformulation | `src/screens/Reformulation.tsx` | « Si je comprends bien : … », à confirmer avant d'avancer |
| Chemin rapide | `src/screens/Rapide.tsx` | Dépôt d'un cahier des charges, et ce qu'il manque |
| Récapitulatif | `src/screens/Recap.tsx` | Le dossier relu et validé par le client |
| Fin | `src/screens/Fin.tsx` | Accusé de transmission |
| Reprise | `src/screens/Reprise.tsx` | Retour après interruption |
| Déroulé | `src/screens/Deroule.tsx` | Coulisses : ce que la machine fait de chaque réponse |
| Prestataire | `src/screens/Dashboard.tsx` | Les cadrages en cours, côté Studio Cazals |

## Où se trouve quoi

- `shared/points.ts` — les huit points : questions, relances, réponses
  probables, reformulations, pistes d'aide. C'est le script de l'entretien ;
  le modifier change ce que le client lit. Partagé avec le serveur, qui s'en
  sert pour repérer les contradictions.
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
`afficherPlan` — à passer à `false` en production, le sélecteur d'écrans étant
un outil de démonstration.

## Le modèle

L'entretien est conduit par **`qwen/qwen3.7-plus`** via OpenRouter. Six
capacités, toutes côté serveur — la clé ne touche jamais le navigateur :

| Capacité | Ce qu'elle remplace |
| --- | --- |
| Propositions | Les réponses probables, écrites pour le métier du client |
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
regénère sa reformulation. Le récapitulatif lit ce cache plutôt que la mémoire
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

Accessible via le sélecteur « Parcours » hors session, ou directement en mode
démonstration. Il demande le jeton d'administration au premier accès et le garde
dans le `localStorage` — jamais dans une URL.

## Reste à faire

- **Écran de dépôt.** La route `POST /api/cadrage/:token/analyse` fonctionne et
  est testée, mais le panneau « Cinq points sur huit sont couverts » est encore
  le texte figé de la maquette : il reste à le brancher sur la route.
- **PDF et Word.** Seuls le texte collé et les fichiers texte sont lus. Les
  binaires sont signalés au client (`fichiersIllisibles`) plutôt qu'ignorés en
  silence, mais leur contenu n'entre pas dans l'analyse. Le modèle accepte les
  images : une extraction PDF reste à ajouter.
- **Courriel.** Le récapitulatif promet « vous recevrez une copie par
  courriel » : rien n'est envoyé. La validation enregistre le dossier, elle ne
  notifie personne — ni le client, ni Nicolas.
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
