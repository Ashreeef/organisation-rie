# Réserve « désossée » pour cuisse-poulet-tandoori

**Contexte** : l'alias `Cuisses de poulet désossée + Pomme espagnole` a été ajouté à
`cuisse-poulet-tandoori` (commit `01e9790`). Avant de considérer le nettoyage clos,
vérification que « désossée » n'apparaît pas dans l'historique comme un plat DISTINCT
de « tandoori » (ce qui aurait pollué la moyenne de `cuisse-poulet-tandoori`).

**Résultat du grep « désossée » (dé-accentué) dans les 2 sources :**

- `data/raw/real.csv` : **0 occurrence** → réserve non applicable (pas de « désossée »
  dans cette source historique).
- `data/raw/2025-data.csv` : **11 lignes** (10 distinctes), toutes sur le motif
  « Cuisses de poulet désossée + [accompagnement] » WITHOUT « tandoori » :
  ```
  Cuisses de poulet désossée + épinards et pommes au curry
  Cuisses de poulet désossée + gratin de légumes
  Cuisses désossée + riz cha3ria
  Cuisses de poulet désossée + Riz
  Cuisses de poulet désossée + Pomme Forestier OU Tajine jben
  Cuisses désossée + Spaghetti à la chinoise
  Cuisses de poulet désossée + Pomme espagnole  (×2)
  Cuisses de poulet désossée + pomme coucha
  Cuisses de poulet désossée + Ratatouille
  Cuisses de poulet désossée tandoor + Fenouille ...
  ```

**Conclusion** : « désossée » sans « tandoori » n'est PAS un plat distinct — c'est la
même recette tandoori écrite avec l'accompagnement à la place du descriptif. Le
catalogue a déjà `Cuisse de poulet désossée` (sans tandoori) parmi les aliases de
`cuisse-poulet-tandoori`. L'ajout est donc sémantiquement cohérent.

**Limite documentée** : seules les occurrences avec ± « Pomme espagnole » (fréq 2×) ont
été ajoutées comme alias. Les autres variantes d'accompagnement (« épinards »,
« gratin de légumes », « riz cha3ria », « Riz », « Ratatouille »...) restent 1× =
candidates de la phase catalogue, **pas** ajoutées en bloc (garde-fou dilution).