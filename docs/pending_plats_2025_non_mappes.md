# Plats 2025 non mappés — phase catalogue dédiée


Extrait au commit courant. Initialement **88 textes distincts, 88 lignes**
(plats distincts ou variations 1× — candidats de la phase catalogue,
PAS des alias, garde-fou dilution).

## Résolution phase catalogue (commit `…`)

Sur les 88 textes :
- **73 mappés** (83 %) par `alias` de dish (variantes ortho/pluriel réelles),
  élargissement `ALLOW_TOKENS` (accompagnements/sauces sûrs, chacun vérifié
  en mot-isolé `find_dish(token)=None`) ou combinaison des deux ;
- **7 textes `[OU]`** : restent **non mappés** par principe (décision Phase 5,
  invariant testé `test_ou_combos_unmapped`) ;
- **8 textes hors cadres** : plats réellement distincts absents du catalogue
  ou événements — laissés non mappés (détails ci-dessous).

**Couverture mesurée sur `data_2025_.csv` (222 lignes)** : `plat_principal_1`
mappé **62,2 % → 82,0 %** (+19,8 pts) ; `plat_principal_1` OU
`plat_principal_2` **76,1 % → 88,7 %**.

Nouveaux dishes créés (plats traditionnels distincts à part entière,
`typical_ratio` défaut 0.60) : `kebda-mcharmela`, `tajine-lebhar`,
`tajine-houte`. Note : `Tajine djebana` a été rattaché à l'orthographe
canonique `tajine-jelbana` (variante dialectale existante, alias ajouté) —
pas un nouveau dish.

Nouveaux tokens `ALLOW` (16 — miroir Python↔TS, testé `TestAllowSync`) :
`epinards, sautes, sautees, ail, ecrasee, cocktail, maklouba, farcies,
farcie, bordelaises, patate, flanc, carotte, aubergine, roquefort, d`.

Les alias ajoutés suivent la règle Phase 3 : variante orthographique/pluriel
réellement observée du dish cible, jamais de préfixe ultra-court susceptible
de diluer (`Cuisses de poulet` seul n'a PAS été ajouté — textes correspondants
mappés par alias exact).

### Textes conservés non mappés (15)

`[OU]` (7 — décision Phase 5) :
- 1× `Chittha djadje OU Couscous au poulet` [OU]
- 1× `Chittha djadje OU Tajine zaligou au poulet` [OU]
- 1× `Croquette de poisson + Tchekhouka ou Merguez en sauce + Frite` [OU]
- 1× `Cuisses de poulet désossée + Pomme Forestier OU Tajine jben` [OU]
- 1× `Escalope grillée + Pomme Lyonnaise OU Emincé de poulet au curry + Pâtes` [OU]
- 1× `Merlan frit + Riz OU Kbab` [OU]
- 1× `Sole Farci et Pâtes Coudes OU Moussaka` [OU]

Hors cadre (8 — plats absents du catalogue, mapping = faux positif) :
- 1× `Déjeuner TOP EMPLOYER` — événement entreprise
- 1× `Emincé de dinde au curry + Tagliatelle` — émincé de dinde absent (1×)
- 1× `Cuisses de poulet à la napolitaine + pate à l'italienne` — variante ambiguë (1×)
- 1× `Boulette de poisson + Riz` — poisson en boulette absent (1×)
- 1× `Jambon de poulet farci gratiné + julienne de légumes et pate` — jambon de poulet absent (1×)
- 1× `Poulet à la marocaine + pomme coucha` — « poulet marocain » ≠ mexicaine/tajine marocain
- 1× `Steak haché en sauce + Pomme boulangere` — steak haché ≠ navarin de bœuf
- 1× `Steak hachée poulet gratinée + Pomme sautée` — steak haché POULET ≠ dindes

## Origine du chiffre « 66 » vs « 88 » (trace requise)

Le « 66 » mentionné en conversation était une estimation à la volée
(69 − 3 alias). Vérification ligne à ligne (git 4081ff9 → 01e9790) :
**AUCUN effet de bord** des alias ajoutés — les 7 lignes remappées sont
expliquées 7/7 par les 5 alias ajoutés (3 textes validés + 2 variantes
courtes `Titli`, `Chittha djaj` qui n'avaient pas été comptées distinctes).
126 → 133 mappés (Δ=7). Le chiffre exact actuel est 88 textes distincts,
tous 1× (plus aucune répétition). La différence 66→88 vient de la sous-
estimation du total initial (69 n'était qu'un bucket sur plusieurs :
OU-combos, rest-non-ALLOW non résolus, préfixe-ok 1-mot).

> **Jours `[OU]`** (8 combos distincts) : la question « ratio single vs
> multi-option » est tranchée (aussi loin que mesurable) dans
> `docs/jours_OU_mesure.md` — **aucune évidence trouvée, échantillon trop
> petit pour trancher** (p=0.85, z=+0.11, n=8). Décision Phase 5 en suspens
> à ce sujet (pas de champ dédié a priori).