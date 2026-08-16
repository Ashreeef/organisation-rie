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
