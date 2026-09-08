"""
Génère dashboard/lib/menu-catalog.ts depuis src/menu_optimization/menu_catalog.json.

Le catalogue JSON est la source de vérité unique : ce script le transforme en
module TypeScript (types + constantes + utilitaires) consommé par l'interface
(Gestionnaire de menus, pages d'analytique, bannières de prévision).

Usage:
    python scripts/gen_menu_catalog_ts.py [--catalog PATH] [--out PATH]
"""
import argparse
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG = REPO_ROOT / "src" / "menu_optimization" / "menu_catalog.json"
DEFAULT_OUT = REPO_ROOT / "dashboard" / "lib" / "menu-catalog.ts"

# Tokens autorisés dans le « reste » d'une correspondance préfixe (mirror menu_catalog_py.py ALLOW_TOKENS)
ALLOW_TOKENS = {
    "+", "et", "avec", "de", "a", "la", "le", "les", "au", "aux", "du", "des", "en",
    "riz", "pilaf", "basmati", "chairia", "libanais", "oriental", "paella", "creole", "indien", "rouge",
    "pomme", "pommes", "puree", "vapeur", "sautee", "rissolee", "rissolees", "croquette", "croquettes",
    "boulangere", "espagnole", "angroise", "coucha", "hangroise", "dauphine", "bordelaise", "epicee",
    "frite", "frites", "friture", "paille",
    "legumes", "ratatouille", "jardiniere", "haricots", "haricot", "verts", "petits",
    "sauce", "tartare", "mexicaine", "mexicain", "curry", "moutarde", "barbecue", "fromage",
    "piquante", "vierge", "financiere", "creme", "aufour",
    "pates", "tagliatelles", "spaghetti", "risotto",
    "chekchouka", "batata", "fliou", "salade", "sale", "dauphinoises", "gratin", "grillee", "grillees",
    # Élargissement Phase 3 — tokens révélés par la catégorisation des unmatched
    # 2025-data (variantes d'accompagnements). Chacun vérifié EN MOT-ISOLÉ avant ajout :
    # find_dish(token)=None (règle short-search ne les résout PAS → pas un nom de plat).
    # farci/viande : sûrs aussi — aucun alias ne COMMENCE par ces tokens (toujours 2e+) et
    # ils servent de rest légitime. Miroir de menu_catalog_py.py ALLOW_TOKENS.
    "pate", "chinoise", "cha3ria", "viande", "farci", "flou", "italienne",
    "champignons", "pistou", "panee", "napolitaine", "julienne", "tchekhouka",
    "chakhchouka", "bourghoul", "terre", "florentine", "maison", "provencale",
    "turque", "rotte", "pasta", "tagliatelle", "tourte", "clafoutis", "l",
}
ALLOW_JSON = json.dumps(sorted(ALLOW_TOKENS), ensure_ascii=False)


def _ts(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def _ratio_effect(value: str) -> str:
    mapping = {
        "tres_eleve": "très élevé",
        "eleve": "élevé",
        "moyen": "moyen",
        "faible": "faible",
    }
    return mapping.get(value, "moyen")


def render(catalog: dict) -> str:
    cats = catalog["dish_categories"]
    dishes = catalog["dishes"]
    acc_cats = catalog["accompaniment_categories"]
    accs = catalog["accompaniments"]

    cat_type_union = " | ".join(f"{_ts(c['id'])}" for c in cats)
    cat_entries = ",\n".join(
        "  { id: " + f"{_ts(c['id'])}, label: {_ts(c['label'])}, color: {_ts(c['color'])}" + " }"
        for c in cats
    )
    dish_objects = ",\n".join(
        "  {\n"
        f"    id: {_ts(d['id'])},\n"
        f"    name: {_ts(d['name'])},\n"
        f"    category: {_ts(d['category'])},\n"
        f"    aliases: {json.dumps(d['aliases'], ensure_ascii=False)},\n"
        f"    keywords: {json.dumps(d['keywords'], ensure_ascii=False)},\n"
        f"    typical_ratio: {d['typical_ratio']},\n"
        f"    ratio_effect: {_ts(_ratio_effect(d['ratio_effect']))},\n"
        f"    is_traditional: {str(d['is_traditional']).lower()},\n"
        f"    is_premium: {str(d['is_premium']).lower()},\n"
        "  }"
        for d in dishes
    )
    acc_cat_entries = ",\n".join(
        "  { id: " + f"{_ts(c['id'])}, label: {_ts(c['label'])}" + " }"
        for c in acc_cats
    )
    acc_objects = ",\n".join(
        "  {\n"
        f"    id: {_ts(a['id'])},\n"
        f"    name: {_ts(a['name'])},\n"
        f"    category: {_ts(a['category'])},\n"
        f"    aliases: {json.dumps(a['aliases'], ensure_ascii=False)},\n"
        "  }"
        for a in accs
    )
    acc_cat_union = " | ".join(f"{_ts(a['id'])}" for a in acc_cats)

    premium = [d for d in dishes if d["is_premium"]]
    traditional = [d for d in dishes if d["is_traditional"]]
    high_ratio = [d for d in dishes if _ratio_effect(d["ratio_effect"]) in ("élevé", "très élevé")]

    return f"""// Auto-generated from src/menu_optimization/menu_catalog.json
// Do not edit by hand — run: python scripts/gen_menu_catalog_ts.py

export type DishCategory = {cat_type_union}

export type RatioEffect = 'très élevé' | 'élevé' | 'moyen' | 'faible'

export interface Dish {{
  id: string
  name: string
  category: DishCategory
  aliases: string[]
  keywords: string[]
  typical_ratio: number
  ratio_effect: RatioEffect
  is_traditional: boolean
  is_premium: boolean
}}

export const DISH_CATEGORIES: {{ id: DishCategory; label: string; color: string }}[] = [
{cat_entries}
]

export const DISHES: Dish[] = [
{dish_objects}
]

export type AccompanimentCategory = {acc_cat_union}

export interface Accompaniment {{
  id: string
  name: string
  category: AccompanimentCategory
  aliases: string[]
}}

export const ACCOMPANIMENT_CATEGORIES: {{ id: AccompanimentCategory; label: string }}[] = [
{acc_cat_entries}
]

export const ACCOMPANIMENTS: Accompaniment[] = [
{acc_objects}
]

const ALLOW = new Set({ALLOW_JSON})

function iconv(s: string): string {{
  return s.normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/['']/g, ' ')
    .replace(/[\\u2018\\u2019]/g, ' ')
    .replace(/[+&|]/g, ' + ')
    .replace(/\\s+/g, ' ')
    .trim()
}}

function score(a: string[], t: string[]): number {{
  if (!a.length || !t.length) return 0
  if (a.length === t.length && a.every((v, i) => v === t[i])) return 100 + a.length
  if (a.length >= 2 && t.length > a.length && a.every((v, i) => v === t[i])) {{
    const rest = t.slice(a.length)
    if (rest.every(tok => ALLOW.has(tok))) return a.length
  }}
  if (t.length === 1 && a.length >= 2 && a[0] === t[0] && !ALLOW.has(t[0])) return 0.5
  return 0
}}

/** Find a dish by name or alias (strict: exact, prefix+allowance, short-search). */
export function findDishByName(input: string): Dish | undefined {{
  const n = iconv(input)
  if (!n) return undefined
  const t = n.split(/\\s+/).filter(Boolean)
  let bestScore = 0, best: Dish | undefined = undefined
  for (const d of DISHES) {{
    const cands = [iconv(d.name), ...d.aliases.map(iconv)]
    for (const a of cands) {{
      const s = score(a.split(/\\s+/).filter(Boolean), t)
      if (s > bestScore) {{ bestScore = s; best = d }}
    }}
  }}
  return best
}}

/** Get menu category string for the analytics page. */
export function getMenuCategory(dish: string): DishCategory | 'Autre' {{
  const found = findDishByName(dish)
  return found ? found.category : 'Autre'
}}

/** Get all dishes sorted alphabetically within each category. */
export function getDishesByCategory(): Record<DishCategory, Dish[]> {{
  const result = {{}} as Record<DishCategory, Dish[]>
  for (const cat of DISH_CATEGORIES) {{
    result[cat.id] = DISHES
      .filter((d) => d.category === cat.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }}
  return result
}}

export const MENU_STATS = {{
  totalDishes: {len(dishes)},
  premiumDishes: {len(premium)},
  traditionalDishes: {len(traditional)},
  highRatioDishes: {len(high_ratio)},
}}
"""


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=str, default=str(DEFAULT_CATALOG))
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)

    catalog = json.loads(Path(args.catalog).read_text(encoding="utf-8"))
    ts = render(catalog)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(ts, encoding="utf-8")
    print(f"Ecrit {out} ({len(ts.splitlines())} lignes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
