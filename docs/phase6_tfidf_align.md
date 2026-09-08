# Phase 6 — Alignement TF-IDF / SVD au serving (enrichissement alias)

## Contexte

Le modèle consomme des features texte latentes (`tfidf_svd_0..7`, 8 composantes
pour ~126 features) dérivées d'un TF-IDF réduit par SVD, ajusté sur le **texte
historique brut et messi** (`real_clean.csv` : variantes orthographiques,
abréviations, régionalismes).

Depuis la Phase catalogue, le **planner fournit des noms canoniques propres**
(sélection via le dashboard, id canonique explicite). Ces noms produisent des
coordonnées SVD différentes de la distribution d'entraînement, car le
vocabulaire / les fréquences diffèrent.

**Severité évaluée : faible.** SVD = 8/126 composantes ; les features
keyword-based (plus nombreuses) restent correctes car les noms canoniques
contiennent les bons mots-clés ; DOW / office_present / calendaire au visage
probable. Correctif justifié car **bon marché** (alias déjà accessibles côté
Python au serving).

## Correctif (délibérément minimal)

Dans `apply_menu_text_features` (`src/menu_optimization/menu_catalog_py.py`),
au **serving**, le texte des plats **sélectionnés via le dashboard** (id
canonique explicite `plat_principal_X_id`) est enrichi de ses alias du catalogue
avant TF-IDF :

```
# au lieu de :  "Cuisse de poulet grillée"
# →            "Cuisse de poulet grillée Cuisse de poulet grillé Cuisse de poulet grillée ..."
```

### Garde-fous imposés à l'implémentation

1. **Seules les lignes à id canonique explicite sont enrichies**
   (`_has_explicit_dish_id`). Les lignes de replay historique (replay via
   `real_clean.csv`, **sans** id) gardent le texte brut → **reproduction exacte
   des features texte d'entraînement préservée** (invariant réel,
   `test_persisted_transformers_reproduce_training` reste vert).
2. **Textes non mappés** (`find_dish=None`) → aucun alias injecté, inchangé →
   aucune fausse injection de vocabulaire.
3. **Pas de re-fit** supplémentaire : les transformeurs persistés
   (`vectorizer`, `svd`) sont toujours appliqués tels quels (aucun skew nouveau).

## Impact mesuré (dataset real, bundle réel)

| Dishe (id explicite) | brute | enrichi | \|Δ SVD0..7\| |
|---|---|---|---|
| `poulet-roti` « Poulet rôti » | `poulet roti` | + alias | 0.021 |
| `cuisse-poulet-grille` « Cuisse de poulet grillée » | `cuisse de poulet grillee` | + alias | 0.135 |
| `cuisse-poulet-roti` « Cuisse de poulet rôtie » | `cuisse de poulet rotie` | + alias | 0.223 |
| `cuisse-poulet-tandoori` « Cuisse de poulet désossée tandoori » | … | + alias | 0.067 |

Déplacement modeste mais cohérent dans l'espace latent. Ligne **sans** id
(replay) → strictement identique (contrôle).

## Vérifications

- Parité / invariants : `test_menu_matching.py` **99 passed** (dont 4 nouveaux
  du `TestPhase6Enrichment`).
- Chemin live complet (`regenerate_features_for_date` → `generate_features` →
  `apply_menu_text_features`) : un menu avec id canonique produit des coordonnées
  SVD **différentes** de la même ligne sans id → l'enrichissement est bien
  déclenché de bout en bout ; la prévision reste **finie et bornée**
  (`0.30 ≤ ratio ≤ 0.88`) — sanity check « menu canonique → prévision saine »
  (tests `TestPhase6ServeTimeEnrichment`, équivalent du menu Dar El Kaid).
- Suite complète attendue : **~282 passed** (99 matching + 4 legacy + …).
