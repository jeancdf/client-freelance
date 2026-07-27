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
| Prestataire | `src/screens/Dashboard.tsx` | Les cadrages en cours, côté Studio Bassot |

## Où se trouve quoi

- `src/data/points.ts` — les huit points : questions, relances, réponses
  probables, reformulations, pistes d'aide. C'est le script de l'entretien ;
  le modifier change ce que le client lit.
- `src/state.ts` — la machine à états : navigation, brouillon, arbitrage,
  validation des reformulations.
- `src/styles.css` — les jetons de la maquette et toutes les règles d'écran.
- `src/App.tsx` — le montage, le thème et la couleur d'accent.

`<Cadrage>` accepte trois réglages : `theme` (`auto` | `clair` | `sombre`),
`accent` (couleur de marque, éclaircie automatiquement en thème sombre) et
`afficherPlan` — à passer à `false` en production, le sélecteur d'écrans étant
un outil de démonstration.

## Reste à faire

- **Persistance.** L'interface promet « Enregistré à chaque mot » et une reprise
  depuis n'importe quel appareil ; rien n'est encore stocké. L'écran de reprise
  affiche un contenu figé.
- **Envoi du dossier.** « Valider et envoyer » ne fait qu'avancer d'un écran.
- **Dépôt de fichiers.** La liste de fichiers et la zone de glisser-déposer sont
  inertes.
- **Côté prestataire.** Le tableau des cadrages est statique ; les onglets, le
  filtre et « Nouveau lien » n'agissent pas.

## Maquette d'origine

`design/Cadrage.dc.html` est le prototype Claude Design dont ce code est
l'implémentation, avec son runtime `design/support.js`. Il sert de référence
pour les intentions visuelles ; il n'est pas construit ni servi par Vite.
