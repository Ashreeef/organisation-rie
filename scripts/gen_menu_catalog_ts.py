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

function iconv(s: string): string {{
  return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim()
}}

/** Find a dish by partial name or alias match. */
export function findDishByName(input: string): Dish | undefined {{
  const normalized = iconv(input)
  if (!normalized) return undefined
  return DISHES.find((d) => {{
    const dn = iconv(d.name)
    if (dn === normalized) return true
    return d.aliases.some((a) => {{
      const an = iconv(a)
      return an && (an === normalized || an.includes(normalized) || normalized.includes(an))
    }})
  }})
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
