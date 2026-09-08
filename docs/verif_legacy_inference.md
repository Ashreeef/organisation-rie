# Vérification Phase 4 — menu legacy texte-sans-id vs inférence

**Question (cloture Phase 4)** : un jour futur dont le menu planifié contient un
`plat_principal_1` en texte libre non résolu à un id (enregistrement legacy
pré-Phase 4, ou saisie hors mailles du filet) — que reçoit le modèle à
l'inférence ? NaN/0 silencieux (risque de DecimalError comme au début) ou
erreur visible ?

## Réponse mesurée (pas "à noter" — vérifié)

Un test d'intégration est ajouté : `tests/test_legacy_menu_flow.py` (guarded
sur la présence de `real_clean.csv`, `features_train.csv`, `_deployment.pkl`).
Il prend une vraie date future opérationnelle hors historique, injecte un menu
legacy texte-sans-id, exécute le pipeline réel `regenerate_features_for_date`
→ `generate_features` → `predict_today` (bundle réel), et vérifie qu'aucune
des colonnes consommées par le modèle ne contient de NaN et que la prédiction
aboutit (ratio borné).

Résultat empirique (probe + test) :
- `find_dish("Plat Fantome Legacy Non Reference XYZ")` → **None** (non mappé).
- Ligne `features_live` : **AUCUN NaN parmi les ~157 feat_cols**. Détails :
  - `menu_mapped = 0` (repli regex `extract_menu_features` + flags 0) ;
  - `plat1_te` et `conditions_te` → **moyenne globale** (`0.606`) via
    `fillna(plat1_global)` dans `apply_menu_text_features` — pas de NaN ;
  - `tfidf_svd_*` → valeurs numériques finies (vecteur quasi nul, tokens hors
    vocabulaire → 0, mais jamais NaN) ;
  - `_fill_live_nans` remplit les stats DOW/OP manquantes pour jours futurs ;
  - dernier garde-fou : `_predict_ratio_from_features` fait
    `X[col] = X[col].fillna(0)` **avant** tout `.predict()`.
- **Prédiction OK** : ratio borné (0.30–0.88), aucun crash ni DecimalError.

## Pourquoi c'est sûr, en citant le code

1. `apply_menu_text_features` (`menu_catalog_py.py`) : `plat1_te` =
   `.map(fitted["plat1_map"]).fillna(fitted.get("plat1_global", 0.0))` — le
   texte "inconnu" (absent de la map) tombe sur la moyenne d'entraînement.
2. TF-IDF/SVD : `vectorizer.transform()` → colonnes creuses finies (0 par
   défaut), le SVD ne produit pas de NaN.
3. `_fill_live_nans` (`daily_features.py`) : remplit les stats par dow/op pour
   les jours hors historique (vendredi/samedi → agrégats historiques).
4. `_predict_ratio_from_features` (`forecast.py`) : `.fillna(0)` défensif avant
   de passer au modèle, puis `np.clip(ratio, 0.30, 0.88)`.

**Aucune voyelle d'exposition au NaN silencieux sur ce chemin** : le texte non
mappé est absorbé par le repli (regex + moyenne globale + 0 creux), jamais
poussé tel quel dans un `Decimal`. Le test fige ce comportement pour prévenir
toute régression.

## À savoir (limites résiduelles, mais pas un bug)

- Un menu legacy donne des features identiques à un menu *vide* au niveau
  catalogue (menu_mapped=0) — il est donc "silencieusement" traité comme jour
  sans plat mappé. C'est un choix : à l'entraînement ces textes tombent déjà
  sur le même repli, donc pas de skew serving. La Phase 4 côté dashboard
  empêche désormais d'en créer de nouveaux ; les 88 candidats historiques sont
  dans `docs/pending_plats_2025_non_mappes.md` (phase catalogue).
- `menu_fp` (fraîcheur prévision) est calculé sur le texte brut, indépendamment
  du mapping : un menu legacy modifié déclenche correctement une prévision
  "périmée".