# Conventions de travail — RIE Project

## Branches

- `main` : stable, protégée. Merge uniquement depuis `dev`, via Merge Request.
- `dev` : intégration. Toujours fonctionnelle, mais peut contenir du travail en cours.
- `feature/<prenom>-<sujet>` : une branche par tâche. Exemples :
  - `feature/salah-data-extraction`
  - `feature/mustapha-pipeline-lgb`
  - `feature/islem-eda-menu`
  - `feature/ashref-ensemble-blend`

## Merge Requests

- Toute Merge Request vers `dev` doit être **relue par une autre personne**
  avant merge — même pour un changement qui semble trivial.
- Décrire dans la MR : ce qui change, pourquoi, comment c'est testé/validé
  (score OOF avant/après si c'est un changement de modèle).
- Pas de notebook dans une Merge Request qui touche `src/` — si la logique
  doit tourner en production, elle est dans un module `src/`, testée, et
  éventuellement illustrée depuis un notebook qui l'importe.

## Commits

- Messages clairs, en français ou anglais (cohérence par personne acceptée),
  au présent : `Ajoute la feature ramadan_day_n`, `Fix bug lag calculation`.
- Un commit = un changement logique. Éviter les commits "WIP" en masse sur `dev`.

## Style de code

- `black` pour le formatage Python (config par défaut).
- Docstrings sur toute fonction publique dans `src/`.
- Seeds fixées explicitement partout où il y a de l'aléatoire
  (`random_state=42` ou équivalent) — reproductibilité obligatoire.
- Toute dépendance ajoutée va dans `requirements.txt` avec une version pinned
  (`lightgbm==4.3.0`, pas `lightgbm`), pour que l'environnement soit identique
  chez tout le monde — c'est particulièrement important tant que l'accès
  Domino n'est pas garanti pour tous.

## Données

- Jamais de données réelles (même échantillon) commitées dans le dépôt.
- `data/` est gitignored. Si un fichier de données doit être partagé entre
  coéquipiers en dehors de Domino, passer par SharePoint/Teams Files, pas par git.

## Issues

- Une tâche = une Issue GitLab, assignée à une personne, liée à la Merge
  Request qui la résout.
- Labels suggérés : `layer:forecasting`, `layer:menu`, `layer:procurement`,
  `layer:waste`, `layer:dashboard`, `blocked`, `question-tuteur`.
