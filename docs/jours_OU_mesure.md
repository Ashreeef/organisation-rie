# Jours « OU » (plats alternatifs) — mesure d'origine Phase 2, enfin chiffrée

## Question d'origine (audit des typical_ratio)

La Phase 1/2 avait tagué les textes contenant un « ou » isolé (ex.
`Merlan frit + Riz OU Kbab`) comme « OU-combo (Phase 5 décidera) » — sans
jamais répondre à la question posée à l'origine :

> Les jours avec plats alternatifs (« OU ») ont-ils un ratio de fréquentation
> mesurablement différent des jours single-option ?

## Réponse : NON mesurable — et in-tranchable sur les données actuelles

**Deux bases disjointes sur ce critère :**

| Base | jours OU | office_present ? | ratio dérivable ? |
|---|---|---|---|
| `data/raw/real.csv` | **0/605** (ni en p1 ni en p2) | oui | oui — mais aucun OU |
| `data/raw/data_2025_.csv` | **8/222** (8 combos distincts) | **non** | non |

Le seul historique où l'on peut calculer `ratio = cantine/office` n'a **aucun**
jour « OU » ; l'historique qui contient des jours « OU » n'a pas
`office_present`. La vraie question (ratio single vs multi) est donc
**in-tranchable** avec l'existant, pas seulement « pas encore mesurée ».

## Proxy mesuré (seul chiffre disponible) : cantine_presence, contrôlée par dow

Sur 2025 (8 jours OU vs 214 single), normalisé contre les jours non-OU du même
jour de semaine :

- `z` moyen : **+0.11** (unités d'écart-type par rapport aux peers même dow)
- % vs jours peers même dow : **+0.6 %**
- Médiane single 310 vs médiane OU 318 (écart ~2 %)
- Mann-Whitney : **p = 0.85** — n'approche aucun seuil de significativité.

**Attention au sens de ce chiffre** : avec **n=8** jours OU seulement, la
puissance statistique est très faible. « p=0.85 » ne prouve pas l'absence
d'effet — il dit qu'**aucune évidence d'écart n'est détectable** sur un
échantillon aussi petit. Formulation correcte : *« aucune évidence trouvée,
échantillon trop petit pour trancher »*, pas *« pas d'effet »*.

Les 8 jours OU sont répartis à travers la semaine (2×lun, 2×mar, 2×mer, 1×jeu,
1×dim), donc pas d'artefact de structure calendaire.

## Conclusion & recommandation Phase 5

- **Aucune évidence chiffrée d'un traitement spécial du ratio.** À la lecture
  des données disponibles, rien n'indique que les jours « OU » soient des jours
  « plus d'affluence ». Mais l'échantillon est trop petit pour conclure
  (voir réserve ci-dessous).
- Recommandation pragmatique Phase 5 : **ne pas créer de schéma/champ dédié**
  pour l'instant. Deux options d'implémentation premier prix (à ton choix) :
  1. **Mapper le OU comme choix du premier plat listé** (le plus fréquent
     historiquement pour ce combo) — les 8 jours entrent dans le matching,
     avec la réserve qu'on perd l'info "alternatif" (aucun impact mesuré, mais
     échantillon trop faible pour trancher).
  2. **Conserver le tag `[OU]` comme entrée « à 1× »** dans la phase catalogue,
     sans schéma : les 8 occurrences restent dans `pending_plats...` et le
     planner continue de n'offrir qu'un plat par jour (le manager choisit
     l'option qu'il servira réellement) — le pattern "proposer deux plats au
     même jour" ne reprend pas dans le planner.
- Si un jour ce pattern devait **reprendre dans le planner**, la bonne
  question serait « sert-on les deux plats OU le roi choisit ? » → si les deux :
  c'est un jour à double service (ratio inchangé), représentable par un second
  plat ; si un seul : c'est un choix de l'équipe, le planner doit lever
  l'ambiguïté côté saisie (un picker depuis lequel on tranche), pas côté ratio.
- **Réserve statistique (à lire avant toute citation de ce doc)** : n=8 jours
  OU sur 2025, et 2025 n'a pas d'office_present. Les chiffres ci-dessus ne
  **prouvent** pas l'absence d'effet — ils montrent qu'**aucune évidence
  d'écart n'est détectable**. Un lecteur futur doit lire ce document comme
  *« au mieux aucun signal, au pire impossible à mesurer sur l'existant »*,
  pas comme une conclusion statistique ferme. Si la question devait être
  re-posée (ex. reprise du double-service dans le planner), le chemin propre
  est de récupérer `office_present` sur ces 8 dates, ou d'accepter le proxy
  cantine comme suffisant.