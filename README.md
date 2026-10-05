# Conway's Creatures

A 1–4 player card game using Conway's Game of Life. Players 1–4 are Blue, Red, Yellow, and Green respectively. Scan cards, place patterns, and start the simulation. Surviving cells determine the winner when time runs out or the board stops changing.

There is also a **real-time strategy** mode: all teams deploy reusable cards during the running simulation, spending crystals for each creature's original live cells.

## Golly collection

The deck contains **193 unique complete layouts** imported from the Golly 5.0 distribution's `Patterns/Life` files and basic pattern library. Cards use the original pattern titles, or readable source filenames when no title is supplied. Fantasy names and the repeated replacement patterns are gone.

The 53 cards with both width and height under 40 cells are in `images/cards/`. The other 140 cards are in `images/cards/giants/` (including patterns with a dimension of exactly 40). Each directory has its own searchable gallery; both groups remain playable.

Every original live-cell coordinate is preserved. Patterns are not cropped, compressed into small grids, split into connected fragments, or replaced by another creature. Rotations, reflections and translations of the same initial layout count as duplicates. One duplicate Rabbits entry was removed.

Some original files contain whole collections or demonstrations. These remain complete cards, with their source shown on the artwork. A collection can contain objects that also appear on individual cards; splitting those files automatically could break multi-part mechanisms. Deduplication compares complete initial layouts, not every object contained within a collection or every future phase of an oscillator.

Ten bounded-grid examples, two LifeHistory annotation layouts and two executable generators are not included as cards: they require topology, rule or script support beyond standard unbounded B3/S23. `ConwaysCreatures/patterns/import-report.json` accounts for every source file and records each exclusion and duplicate. The original files and Golly license are retained in `ConwaysCreatures/patterns/golly/`.

## Playing

1. Open [the game](https://amjp.psy-k.org/ConwaysCreatures/qr.html).
2. Use **Browse Golly cards** to find a card by its real name. Scan its QR code from another screen, or select **Use in game** in the collection browser.
3. Add cards, then select any game mode and choose **1–4 players** (default **2**). Cards are assigned in scan order, cycling through the selected players. Changing the player count reassigns existing cards and updates their labels; subsequent scans use the new cycle.
4. The translucent team-colored preview shows the entire selected creature. Tap to place it, or use **Place** to accept its suggested position. Use **Rotate** before placing.
5. Drag with one finger to pan; pinch with two fingers to zoom in or out. **+**, **−**, **Fit all**, and mouse-wheel zoom also work. Zoom affects only the view, never the cells or their coordinates. Double-taps on the battlefield are reserved for deployment, without browser zoom. Lifting fingers after a pinch does not deploy a card.
6. Once all cards are placed, press **Start** and choose a duration. The status shows the actual generation and each team's live-cell count.

The main menu animates a Gosper glider gun initially. Adding a card selects its animated preview; tap a card in your deck to preview it again. Previews follow the same Life rules, restart after 160 generations, and pause when you leave the menu. Preview cells do not affect a battle or its crystals.

### Real-time strategy

1. Add your cards, then choose **Start real-time strategy**. Choose the player count (default **2**), then enter the starting crystals for **each** team (default **30**), then the match duration in seconds (default **60**). Positive fractional seconds are also accepted.
2. **Double-tap the battlefield → choose your team → choose a card → tap its deployment location.** Double-taps can be up to **0.9 seconds apart**. The **Deploy** button opens the same picker. The simulation pauses while you choose, rotate, and position your creature, then resumes when you deploy or cancel. **Cancel** or **Escape** closes the picker without spending crystals.
3. A card costs one crystal per original live cell, regardless of its bounding box. For example, a glider costs 5 crystals and this Golly phase of the Gosper gun costs 32. Unaffordable cards are disabled. Selecting or rotating a card does not spend crystals; placing it does.
4. All teams can reuse any scanned card as often as their own balance allows. There is no turn order. New live cells replace existing live cells and their team color; empty spaces in the new pattern leave the battlefield unchanged. Overlapping cells still cost crystals.
5. Use **Rotate** and **Fit all** to inspect the translucent team-colored preview, then tap to deploy or press **Place**. Dragging pans without deploying. **Deploy** lets you replace a pending selection or cancel it.
6. Crystals do not regenerate, and deaths do not refund them. The countdown pauses throughout card selection and placement. When time expires, the team with the most live cells wins; a tie for the highest count draws. A team is eliminated early only if it has no live cells and cannot afford any owned card. Play continues while at least two teams remain; the last remaining team wins. If all teams are eliminated, the match is a draw. Solo play continues until time expires, the player ends the match, or no cells and no affordable cards remain, then reports the final live-cell score. Empty or stable boards otherwise continue until the time limit. Press **End** to score immediately, or **Menu** to leave. A new game resets the board, timer, and all balances.

### Real-time with separate decks

Use the new **Start real-time — separate decks** button to restrict each team to its own scanned cards. Players take turns adding cards: scans cycle through Blue, Red, Yellow, and Green, using only the selected number of players. Before the first game, scans default to two players. Choosing a different count redistributes existing cards in scan order. The Add card button and menu show whose turn is next, and each card is labeled with its owner. Invalid scans, cancelled scans, and camera failures do not advance the turn. Cards added through the collection browser follow the same assignment order.

Scan at least one card for each team before starting this mode. Each team's deployment picker shows only its own cards, which remain reusable while affordable. If multiple players scan the same pattern, each can use it. Elimination checks affordability using that team's cards only. Choose enough starting crystals to afford your cards; the Gosper gun costs 32, above the default 30.

This variation uses the same crystal and duration prompts, paused selection and placement, and end conditions as real-time strategy. Scanning alternates; deployment has no turn order. The original **Start real-time strategy** button still shares all scanned cards between all teams. Card ownership is retained when switching modes with the same player count during the current page session.

The simulation uses a sparse, unbounded board: cells can move beyond the screen without disappearing at an artificial edge. All colors follow B3/S23, counting neighbors of every color. Surviving cells keep their color. Newborn cells take the majority color of their three neighbors. When all three neighbors have different colors, the birth selects one of those colors deterministically using its coordinates, varying the choice across the board. Collisions can destroy guns and other creatures.

Large layouts take longer per generation. A high-period gun may need hundreds of generations before an emission; the generation counter, rather than elapsed seconds, indicates its progress. Some previews contain hundreds of thousands of cells, so individual cells merge visually at card scale; zoom in the game to inspect the unchanged layout.

## Rebuilding

Import a Golly 5.0 distribution (the directory containing `Patterns/`, `Scripts/`, and `License.html`):

```sh
python3 tools/import_golly.py /path/to/golly-5.0
python3 tools/build_cards.py --clean
```

`catalog.json` stores compact RLE, real names, dimensions, source hashes and deduplication fingerprints. `cards.json` maps the canonical card IDs. Original `.rle`, `.rle.gz`, and Life 1.05 files are parsed without cell-count or dimension limits; scripts are not executed. Source collections are never automatically split.

The card builder requires `pycairo` and `qrcode`. It generates PNGs, the searchable card index, both standalone JS exports, and the complete game embedded in `qr.html`. `--clean` removes obsolete card PNGs. Use `--data-only` to rebuild the page without artwork. No PDF is generated by default; `--pdf` is optional.

Checks:

```sh
node tests/life.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

Tests cover all Life neighborhoods, original-source fidelity, duplicate detection, PNG geometry for small patterns, full decoding of all 1,307,457 source cells, placement of a 210,515 × 183,739 layout, rotation, repeated gun emissions, and matching embedded game data. The artwork tests use Pillow.

Game tests also cover 1–4 player setup in every mode, input validation, scan reassignment, four-color inheritance and rendering, solo scoring, multiplayer ties and elimination, real-time team selection and touch deployment, slower double-taps, pausing throughout selection and placement, resuming after deployment or cancellation, crystal spending and affordability, overlap replacement, reusable cards, continued evolution on empty or stable boards, and independent animated previews.

## Updating the website

Upload `ConwaysCreatures/qr.html` and `ConwaysCreatures/images/` to the site's `ConwaysCreatures/` directory. Replace the old card PNGs with the new set; merging alone leaves obsolete fantasy cards on the server. Include `images/cards/index.html` for the searchable collection. No PDF update is needed.

`qr.html` embeds its matching engine, game code and pattern data. There is no separate pattern-script download to become stale. After uploading, reload the page using a fresh query string if your browser has cached an earlier version.

Source format reference: [Golly file formats](https://golly.sourceforge.io/Help/formats.html).
