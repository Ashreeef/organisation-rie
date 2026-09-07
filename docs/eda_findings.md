# EDA Findings — Organisation du RIE BNP Paribas

Synthese des observations issues de l'analyse exploratoire (`notebooks/01_eda.ipynb`).

## 1. Structure et Assainissement des Donnees

- **Periode temporelle reelle :** `train.csv` couvre **Mai 2022 a Decembre 2023** (410 lignes / 400 dates uniques) et `test.csv` couvre **Janvier 2024 a Decembre 2024** (229 lignes). Le decalage historique de +1 an a ete corrige.
- **Rythme d'ouverture (Semaine algerienne) :** Le RIE est ouvert du **Dimanche au Jeudi** (ferme Vendredi et Samedi, 0 weekend). La couverture sur les 5 jours ouvres est homogene (~91% a 93%). La rupture d'encodage de `dayofweek` au 01/03/2023 a ete resolue en recalculant le jour calendaire reel depuis `Date`.
- **Doublons de dates :** 20 lignes correspondent a des variantes de menu saisies pour un meme jour (memes effectifs et meteo). Il est imperatif de **dedupliquer par Date avant tout calcul de lag / rolling**.
- **Outlier isole :** Le **23 mars 2023** (1er jour du Ramadan 2023) enregistre `employees_count = 1` pour `office_present = 526` (fermeture exceptionnelle ou defaut de saisie). Cet enregistrement doit etre neutralise pour l'entrainement.

## 2. Les 7 Facteurs Cles de la Frequentation

1. **`office_present` :** Facteur de volume principal (corr=0.54), mais relation sous-lineaire avec le ratio (corr=-0.27) par effet de capacite.
2. **Saisonnalite mensuelle :** Aout represente le creux de frequentation (~270 repas, conges), Octobre le pic (~321 repas).
3. **Jour de la semaine (Dimanche - Jeudi) :** Le Jeudi enregistre le ratio de frequentation le plus fort (0.586 sans l'outlier), le Mercredi represente le creux regulier (0.521).
4. **Composition du menu :**
   - **Boosters d'affluence :** Entrees chaudes/sales (`entree_sale`, r=+0.337, +4.6% de ratio), 2eme plat propose (`has_2nd_plat`, r=+0.296, +4.0%), plats panes/frits (`menu_pane_frit`, r=+0.248, +3.8%), frites (`menu_frite`, r=+0.222, +4.4%), formules legeres/sandwiches (`menu_is_light`, r=+0.204, +3.9%).
   - **Plats traditionnels :** Plats mijotes/couscous (`menu_is_traditional`, r=-0.165, -2.6% de ratio).
5. **Variete de l'offre :** Le nombre d'options d'entrees (`n_entree_choices`, r=+0.283) et la disponibilite d'un 2eme plat (`has_2nd_plat`, r=+0.296) augmentent systematiquement l'affluence.
6. **Croissance annuelle :** La hausse de 2022 a 2023 est portee par la croissance des effectifs presents (`office_present`), absorbee naturellement par la cible en ratio.
7. **Precipitations :** Leger effet positif (+0.015 de ratio les jours de pluie).

## 3. Pieges evites & Recommandations de Modelisation

- **Taxonomie des menus :** Utiliser les 24 features binaires/entieres extraites par `src.menu_optimization.menu_cleaning` au lieu du texte brut.
- **Temperature :** La correlation brute avec le ratio (+0.46) est un artefact saisonnier ; la correlation partielle controlee par le mois tombe a -0.08. Ne pas sur-ponderer la meteo.
- **Rupture Train/Test sur `office_departments` :** Distribution disjointe (35-54 en train vs 42-124 en test). Exclure cette variable brute ou utiliser le ratio normalise `office_present / office_departments`.
- **Modelisation de la cible :** Entrainer les modeles sur le **ratio** `employees_count / office_present` puis multiplier par `office_present` pour la prediction finale.
