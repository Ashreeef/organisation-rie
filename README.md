# Organisation du RIE — BNP Paribas El Djazaïr

Système de prévision de la demande, d'optimisation des menus et de réduction
du gaspillage alimentaire pour le RIE (Restaurant Inter-Entreprises) du siège
BNP Paribas El Djazaïr.

Stage — Département Data / Intelligence Artificielle
16 août 2026 — 30 septembre 2026

## Équipe

| Membre | Site | Responsabilité principale |
|---|---|---|
| Salah Badreddine | Siège Alger | Accès aux données, extraction, nettoyage |
| Mustapha Boulefa | Siège Alger | Modélisation, pipeline ML (Domino) |
| Islem Gouicem | Biskra (distanciel) | EDA, feature engineering, documentation |
| Ashref Berbaoui | Oran (distanciel) | Architecture système, ensemble modeling, dashboard |

Tuteur de stage : M. Omar Otmaniou, Responsable IA.

## Structure du dépôt

```
rie-project/
├── src/
│   ├── forecasting/         # Layer 1 — prévision de la demande
│   ├── menu_optimization/   # Layer 2 — optimisation des menus
│   ├── procurement/         # Layer 3 — aide aux approvisionnements
│   └── waste_tracking/      # Layer 4 — suivi du gaspillage
├── dashboard/                # Layer 5 — tableau de bord opérationnel
├── notebooks/                 # exploration uniquement — jamais la source de vérité
├── docs/                      # cadrage, comptes-rendus, notes EDA
├── data/                      # gitignored — aucune donnée réelle commitée
│   ├── raw/
│   └── processed/
├── tests/
├── requirements.txt
└── README.md
```

**Règle d'or : `notebooks/` sert à explorer. Tout ce qui doit tourner en
production (le pipeline réel) vit dans `src/` sous forme de fonctions/modules
testables.** Un notebook ne doit jamais être la seule copie d'une logique
critique.

## Setup local

```bash
git clone https://github.com/Ashreeef/organisation-rie.git
cd rie-project
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Prévision live — génération quotidienne des features

L'API (`api/forecast.py`) consomme en priorité `data/processed/features_live.csv`
pour les dates futures ; à défaut elle bascule sur les features d'entraînement
(`features_train.csv`), puis sur le repli calendaire.

Générer les features des 14 prochains jours (normalement pris en charge par la
tâche planifiée décrite ci-dessous) :

```bash
python -m src.forecasting.daily_features --days 14
```

Cela rejoue le sous-modèle `office_presence` de façon récursive (semantique de
shift *en lignes*, identique aux notebooks 03/04) puis applique l'ingénierie de
features du notebook 03 aux dates cibles. Pour une date déjà observée, les
features produites sont **identiques** à `features_train.csv` (validation de
fidélité dans `tests/test_daily_features.py`).

Notes de production :
- la météo de chaque date cible vient d'Open-Meteo (prévisions quotidiennes
  réelles, sans clé API, coordonnées du siège 36.7 / 3.2) ; repli sur les
  climatologies mensuelles en cas d'indisponibilité réseau ou au-delà de
  l'horizon de prévision (~16 jours) ;
- le menu vient de `data/processed/planned_menus.csv` (source de vérité unique
  menu → features → prévision) ; une date sans menu planifié est décrite par un
  menu vide (flags 0, TF-IDF « empty »). Chaque enregistrement d'un menu via
  l'API/dashboard régénère immédiatement les features live de la date
  (`api/menus.py` → `regenerate_features_for_date`) — la prévision reflète donc
  le nouveau menu, pas un cache obsolète ;
- les jours fériés (français, algériens et islamiques) et les fenêtres de
  Ramadan viennent de `src/calendar_utils.py`, alimenté par la bibliothèque
  `holidays` (`>= 0.99`) — aucune liste de dates manuelle ; les dates
  islamiques futures (Aïd, Mawlid, ...) sont des estimations astronomiques qui
  peuvent varier d'un jour selon le croissant lunaire observé ;
- un retrain (nouveau `_deployment.pkl` / `office_presence_lgb.pkl`) doit être
  suivi d'une régénération de `features_live.csv`.

### Planification quotidienne (Windows)

Le runner `scripts/run_daily_features.py` ajoute le logging
(`data/logs/daily_features.log`), un journal JSON
(`data/logs/daily_features_last_run.json`) et un code retour exploitable par le
Planificateur de tâches :

```powershell
# installer la tâche quotidienne (06:00 par défaut)
.\scripts\install_daily_task.ps1
.\scripts\install_daily_task.ps1 -At 06:30 -Days 14

# exécution de test immédiate ; retrait de la tâche
.\scripts\install_daily_task.ps1 -RunNow
.\scripts\install_daily_task.ps1 -Uninstall
```

La tâche (`RIE_df_daily_features`) est relancée si le PC était éteint
(`StartWhenAvailable`) et redémarrée jusqu'à 3 fois en cas d'échec.

## Dashboard & API

Interface opérationnelle des 5 layers (prévision, menu, approvisionnement,
gaspillage, planning). Backend FastAPI + frontend Next.js.

```bash
# backend (racine du dépôt) — API sur http://localhost:8000, docs sur /docs
uvicorn api.main:app --reload --port 8000

# frontend — http://localhost:3000
cd dashboard
npm install
npm run dev
```

Pages : `/dashboard` (jour J — prévision, horloge du service, cycle opérationnel),
`/forecasts`, `/menus`, `/menus-planner` (planning des menus), `/history`
(journal + export CSV), `/waste`, `/settings`.

### Paramètres d'application (`data/settings.json`, page `/settings`)

| Clé | Défaut | Rôle |
|---|---|---|
| `site_name` | `Siège — Alger` | affiché dans la sidebar |
| `safety_margin_pct` | `4.0` | marge de sécurité de la recommandation (0–25 %) |
| `service_start` / `service_end` | `12:30` / `13:30` | horaires du service → horloge du dashboard |
| `bilan_deadline` | `15:00` | heure limite de saisie du bilan (alerte si dépassée) |

### Cycle de service opérationnel

État d'une journée dans `data/operational/<YYYY-MM-DD>.json`
(gitignored, fichiers JSON). Machine d'états :
`preparation → service → bilan_a_saisir → bilan_a_confirmer → cloturee`.

Le statut est **avancé automatiquement par l'horloge** (horaires de `/settings`) :
à l'heure de début → `service`, à l'heure de fin → `bilan_a_saisir` ; jamais de
retour en arrière, jamais au-delà de `bilan_a_saisir` (saisie et clôture du
bilan restent des actes manuels). Un bilan n'est considéré **clos** que lorsque
le statut vaut `cloturee` (source de vérité pour le dashboard).

### Principaux endpoints

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/forecast/today` | prévision du jour : repas recommandés, intervalle, marge, drapeaux Ramadan/ferié, `forecast_stale` |
| POST | `/api/forecast` | idem avec date / `office_present` / `menu_id` forcés |
| GET | `/api/operations/today` | état opérationnel du jour + phase horaire (`service_phase`) et horaires |
| POST | `/api/operations/{day}/status` | avance le statut du cycle |
| PUT | `/api/operations/{day}` | modifie l'entrée (preparés, servis, bilan…) |
| GET | `/api/operations` | toutes les journées saisies |
| POST/PUT/DELETE | `/api/menus` , `/api/menus/{date}` | planifier un menu → régénère les features de la date |
| GET | `/api/context/daily` | menu + météo par jour (source des colonnes de l'export CSV historique) |
| GET | `/api/context/holidays?days=7&from_date=…` | jours fériés à venir (cloche du header) |
| GET/PUT | `/api/settings` | lire / mettre à jour les paramètres |

La cloche du header affiche les **jours fériés à venir** dérivés de
`src/calendar_utils.py` (bibliothèque `holidays`, aucune liste manuelle) ;
l'état « vu » est conservé en localStorage.

## Workflow Git

- `main` — toujours stable, déployable. Protégé : pas de push direct.
- `dev` — branche d'intégration. Toutes les feature branches partent d'ici et y retournent.
- `feature/<nom>-<courte-description>` — une branche par tâche.

```bash
git checkout dev
git pull
git checkout -b feature/ashref-ensemble-blend
# ... travail ...
git push -u origin feature/ashref-ensemble-blend
# ouvrir une Merge Request vers dev, demander une review avant merge
```

Voir `docs/CONTRIBUTING.md` pour le détail des conventions.

## Données

**Aucune donnée réelle ne doit être commitée dans ce dépôt** — `data/` est
dans `.gitignore`. Pendant que l'accès Domino se met en place :

- Les données réelles (badges, POS) restent dans l'environnement Domino sécurisé.
- Le développement hors-Domino se fait sur les données du hackathon ou les données non-sensibles
  (anonymisées, dans `data/raw/` en local, jamais poussées).
- Une fois le code validé sur les données hackathon, il est porté et exécuté
  sur les données réelles par les personnes ayant accès à Domino.

## Documents de référence

- `docs/cadrage.md` — rapport de cadrage complet du projet
- `docs/meeting-notes/` — comptes-rendus des réunions d'équipe et avec le tuteur
