# Veggie / vegan check (data/cities/<city>-veggie.json)

Levels (one per place, never guessed):

| level | meaning | needs |
|---|---|---|
| `vegan` | fully vegan (no animal products at all) | own site/menu/Instagram bio says 100% plant-based / vegan, or HappyCow "vegan" + no contradiction |
| `vegetarian` | fully vegetarian (no meat or fish) | own site says vegetarian(-only), or HappyCow "vegetarian" + no contradiction |
| `vegan-friendly` | clear vegan options: labelled vegan dishes, a vegan menu or section | menu / site / HappyCow veg-options text mentioning vegan options |
| `veggie-friendly` | clear vegetarian options (labelled dishes, vegetarian menu) | menu / site / press / HappyCow veg-options |

Sources, in order of precedence (`scripts/veggie_layer.py`):
1. `data/osm/veggie-verified.json` — hand-checked entries (`veggieLevel`, `sources`, `note`, optional `dishes` quoted from a real menu, `checked`). `veggieLevel: null` = checked, no clear options (suppresses weaker sources).
2. `data/osm/happycow-<city>.json` — parsed from the HappyCow printable city list (`https://www.happycow.net/europe/belgium/ghent/print?`), matched by name + street.
3. OpenStreetMap `diet:vegan` / `diet:vegetarian` (`only` → fully, `yes`/`limited` → *-friendly).
4. Curated `vegetarian`/`vegan` = "yes" in `<city>.json` without a layer entry → `veggie-friendly` / `vegan-friendly`.

Procedure (weekly, ± 20 min):
1. Refresh HappyCow: `curl -sL -A 'Mozilla/5.0' 'https://www.happycow.net/europe/belgium/ghent/print?' -o /tmp/hcp.html`, `python3 scripts/parse_happycow.py gent /tmp/hcp.html`, then `python3 scripts/veggie_layer.py gent`.
2. Every place shown as `vegan` or `vegetarian` must have a `veggie-verified.json` entry: open its own site/menu/Instagram and quote the claim in `note`. If the place serves meat/fish (e.g. Boempatat: OSM said vegetarian-only, HLN lists bolognese and chicken), downgrade it and say why.
3. New openings / press (HLN "NET OPEN", Nieuwsblad, EVA vzw / ProVeg, visit.gent): add or update entries; example dishes only when quoted from a real menu, with the URL.
4. Check `data/osm/happycow-gent-unmatched.json` for vegan/vegetarian restaurants that are not in OSM yet (add them to OSM or to `<city>.json` once verified).
5. Never mark a place vegan because of a single vegan dish; that is `vegan-friendly`.
