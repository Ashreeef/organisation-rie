# Rapport de Synthèse — RIE BNP Paribas

## Prédiction de la demande de repas : du fichier brut au modèle cascade

**Fichier source :** `data/raw/real.csv` (666 lignes, 14 colonnes, séparateur `;`, encodage cp1252)

---

## 1. Données brutes

| Propriété | Valeur |
|-----------|--------|
| Fichier | `data/raw/real.csv` |
| Format | 666 lignes × 14 colonnes |
| Séparateur | `;` |
| Encodage | cp1252 |
| Dates | DD/MM/YYYY, du 02/01/2022 au 31/12/2024 |
| Colonnes | Date, office_presence, cantine_presence, entrées, plat pricipal_1, plat principal_2, temperature, temperature ressentie, precipitation (mm), type precipitation, vitesse soulevement du vent, vitesse du vent, couverture nuageuse, conditions |

**Problèmes détectés :**
- `entrées` corrompu (artefact cp1252 → `entrées`)
- `plat pricipal_1` (faute de frappe)
- `plat principal_2` : 253 manquants (38%)
- Données météo manquantes : 37 lignes
- `cantine_presence = 0` : 38 lignes (fermeture cantine)
- `office_presence = 0` : 37 lignes (système fermé, jan–mar 2022)

---

## 2. Statistiques descriptives

### Variables numériques (données brutes)

| Variable | N | Moyenne | Médiane | Écart-type | Skewness | % Manquants |
|----------|---|---------|---------|------------|----------|-------------|
| office_presence | 666 | 475.2 | 492.0 | 89.4 | -0.82 | 0.0 |
| cantine_presence | 666 | 263.3 | 283.0 | 107.1 | -0.98 | 0.0 |
| temperature | 629 | 18.6 | 17.8 | 8.1 | 0.22 | 5.6 |
| precipitation (mm) | 629 | 1.9 | 0.0 | 6.3 | 4.53 | 5.6 |

### Corrélations

- `office_presence` ↔ `cantine_presence` : **r = 0.82**
- `temperature` ↔ `cantine_presence` : r = 0.08
- `precipitation` ↔ `cantine_presence` : r = -0.04

---

## 3. Nettoyage (notebook 01)

| Étape | Lignes | Action |
|-------|--------|--------|
| Données brutes | 666 | Fichier `data/raw/real.csv` |
| Suppression office=0 | 629 | -37 lignes (système fermé jan–mar 2022) |
| Suppression cantine=0 | 605 | -38 lignes (fermeture cantine) |
| Renommage colonnes | 605 | office_presence → office_present, cantine_presence → employees_count |
| Calcul ratio | 605 | ratio = employees_count / office_present, cap [0.30, 0.88] |

**Décisions clés :**
- Les 37 lignes `office_presence=0` sont supprimées (jan–mar 2022, système fermé)
- Les 38 lignes `cantine_presence=0` sont supprimées (fermeture exceptionnelle)
- Le ratio capé à [0.30, 0.88] stabilize le target

---

## 4. Traitement des menus (notebook 02)

- Normalisation texte, séparation des entrées composites
- Catégorisation par protéine : Poulet, Bœuf, Agneau, Poisson, Végétarien, Autre
- Tagging par cuisson et traditionnel vs international
- Canonicalisation floue (fuzzy matching)

| Catégorie | Ratio moyen |
|-----------|-------------|
| Poisson | 0.64 |
| Poulet | 0.61 |
| Bœuf | 0.59 |
| Non spécifié | 0.55 |

---

## 5. Feature Engineering — 126 features (notebook 03)

| Famille | Nb features | Disponibilité | Justification |
|---------|------------|---------------|---------------|
| Calendaire | ~42 | J-7 | DOW, mois, semaine, Fourier seasonality, trend |
| Jours fériés | ~22 | J-7 | FR/islamiques, Ramadan, ponts, payday |
| Office presence | ~24 | J-1 | Lags, rolling, expanding (shift(7) minimum) |
| Menu | ~31 | J-7 | TF-IDF + SVD + keyword flags |
| Météo | ~12 | J-5 | Température, pluie, vent, nuages |
| YoY / Lag | ~20 | J-1+ | Ratios lags 5w/52w, expanding DOW/month |

---

## 6. Sous-modèle office_presence (notebook 04)

**Méthode :** LightGBM, 3 seeds, 5-fold temporal CV, 74 features

| Méthode | RMSE (test) |
|---------|-------------|
| Moyenne par DOW | 46.3 |
| Lag-7 | 38.5 |
| Lag-8 | 37.8 |
| Ridge | 19.2 |
| **LightGBM (retenu)** | **5.91** |

OOF : RMSE = 12.52, R² = 0.9465

---

## 7. Modèle cantine_presence — Cascade (notebook 05)

### Architecture retenue : B — Cascade

| Approche | Asym. Cost (OOF) | Retenue |
|----------|-------------------|---------|
| A — Directe (1 étape) | 28.65 | Non |
| **B — Cascade (office → ratio → cantine)** | **23.85** | **OUI** |

### 36 modèles

| Famille | Nb | Pondération |
|---------|----|------------|
| LightGBM | 24 | 1.7% |
| XGBoost | 9 | 12.1% |
| CatBoost | 3 | **86.2%** |

### Calibration

- Lambda shrinkage : 0.776
- Clip bounds : [243, 614]
- Offsets DOW : Dim -5.0, Lun -6.8, Mar -8.8, Mer -4.3, Jeu -8.3

### Résultats

| Métrique | OOF | Test |
|----------|-----|------|
| Asym. Cost | 23.85 (7.7%) | 18.95 |
| MAE | 15.99 | 17.14 |
| RMSE | 21.56 | 24.51 |

---

## 8. Conclusion

| Métrique | Valeur | Benchmark |
|----------|--------|-----------|
| **Asym. Cost (OOF)** | **7.7% de la moyenne** | **BON / Production-ready** |
| MAE (OOF) | 16.0 repas | |
| RMSE (OOF) | 21.6 repas | |
| Test Asym. Cost | 18.95 | |

### Limites

1. Données limitées : 372 jours valides en entraînement (mai 2022 – déc 2023)
2. Sous-modèle office : features uniquement calendaires + météo (pas d'événements RH)
3. Calibration DOW statique (pas d'adaptation au comportement post-COVID)
4. 126 features sur petit échantillon (atténué par CV temporelle et shrinkage)

### Prochaines étapes

1. Réentraîner avec les données 2024 une fois disponibles
2. Intégrer les données d'événements internes (calendrier RH)
3. Optimiser le sous-modèle avec données de badges d'accès
4. Mettre en place un monitoring de drift en production
5. Ajouter un module de recommandation de menu

---

*Notebook détaillé : `notebooks/stats_synthesis.ipynb`*
*Graphiques : `data/processed/synth_*.png`*
*Fichier source : `data/raw/real.csv`*
