# Pending item — gratin-poulet (Δ typical_ratio)

**État du diagnostic (re-vérifié aujourd'hui) :**

- Lignes real.csv « Gratin de poulet » seul : **11**, dont **9 exploitables** (office,cantine>0).
- Ratio moyen réel : **0.581** (n=9) — ratios : [0.468, 0.485, 0.529, 0.592, 0.595, 0.600, 0.618, 0.638, 0.702].
- typical_ratio catalogue : **0.650** → delta **−0.069** (la valeur flaggée par l'audit Phase 2).

**Conclusion** : ce n'est PAS un problème de matching (les lignes sont propres, non
contaminées ; pas de queue haute). C'est un écart réel entre la valeur « typique »
déclarée (0.650, vraisemblablement estimée) et l'historique (0.581). Vu n=9, la
moyenne est jugée trop fragile pour modifier typical_ratio maintenant.

**Décision** : conserver le typical_ratio tel quel pour l'instant. Réexaminer ce dish
avec davantage d'historique (ou décision explicite de ré-estimer manuellement). En
attente, pas bloquant pour la Phase 4.