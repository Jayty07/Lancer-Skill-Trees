# LANCER Skill Trees

A Foundry VTT module for the [LANCER system](https://foundryvtt.com/packages/lancer) that lets the GM build skill trees, lets players spend points in them, and applies the bonuses automatically.

- **Visual editor**: place skills on a grid or a radial web, drag to move, link prerequisites, set ranks, costs and License Level requirements.
- **Passive modifiers in a few clicks**: pick *Pilot / Mech / Deployables / Drones*, pick a stat (HP, Evasion, E-Defense, Heat Cap, Sensors, Tech Attack, SP…), type a number or a formula. Bonuses become Active Effects, and the LANCER system passes mech and deployable bonuses from the pilot to the active mech and its deployables.
- **Custom effects** for anything more complex (turn triggers, granting items, computed bonuses, attack-flow hooks), written in `scripts/custom-skills.js`.
- **A style per tree**: four themes, six skill shapes, four link styles, row spacing, title banner, background image, accent colors, and 24 built-in skill icons.
- **Two layouts**: *Grid* (rows and columns, with Borderlands-style tier gating) and *Radial web* (a hexagon of sectors and rings with a glowing core).
- **Hover cards** on every skill: icon, rank, cost, status (including exactly why it is locked), effects and a short description, styled to match the tree.

Requires Foundry VTT v13 and LANCER 3.x.

---

## Installing

### From a manifest URL (Foundry or The Forge)
Manifest URL:

```
https://raw.githubusercontent.com/Jayty07/Lancer-Skill-Trees/main/module.json
```

- **The Forge:** open **The Bazaar → Install From Manifest**, paste the URL, click **Install**.
- **Foundry:** **Add-on Modules → Install Module**, paste the URL into *Manifest URL*, click **Install**.

Then enable *LANCER Skill Trees* in your world.

### Manually
Unzip `module.zip` into `Data/modules/lancer-skill-trees/` so that `module.json` sits directly in that folder, restart Foundry, and enable the module.

## Publishing updates

The manifest and `module.zip` are served straight from the `main` branch, so there is no release step:

1. Make your change (for example, a new custom skill in `scripts/custom-skills.js`).
2. Raise `"version"` in `module.json` (1.0.0 → 1.0.1).
3. Run `./build.sh` to rebuild `module.zip`.
4. Commit and push. On The Forge, use **The Bazaar → Update All Packages**; in Foundry, **Check for Updates**.

---

## For the GM

Open the editor from **Settings → Configure Settings → LANCER Skill Trees → Open Editor**, from the **Skill Trees** button at the top of the Actors sidebar, or from the **Editor** button in any character's skill tree window. Changes save automatically.

**Building a tree**
- **New** creates an empty tree; **Example** adds a ready-made one (a Borderlands-style tier tree or a hex web).
- **Double-click** an empty spot to add a skill. **Drag** skills to move them (dropping on another skill swaps them).
- Select a skill, then **Shift-click** another to toggle it as a prerequisite, or tick prerequisites in the inspector. Choose *All* or *Any one* of the checked skills.
- Each skill has a name, icon (pick one of the 24 built-in icons or browse for any image), description (plain text or HTML, `@UUID` links work), cost per rank, max rank and minimum License Level.

**Passive modifiers**
Each modifier is: *where* (Pilot, Mech / NPC, Deployables, Drones, or both) → *stat* → *mode* → *value*.
- *Add* values stack per rank (+2 HP at rank 3 = +6 HP).
- Values can be formulas: `floor(@ll/2)`, `1 + @grit`, `@rank * 2`. Variables: `@ll`, `@grit`, `@tier`, `@hull`, `@agi`, `@sys`, `@eng`, `@rank`. Formulas using `@rank` are not multiplied again.
- *Custom data path…* lets you target any field, and the LANCER *Set/Append JSON* modes are available for advanced use.
- Mech bonuses on a pilot apply to the pilot's **active mech** (the mech must be set as the pilot's active mech, with the pilot set on the mech). Pilot-scope bonuses only apply on trees that belong to pilots.

**Custom effects and macros**
Attach any registered custom effect to a skill and fill in its options. You can also drop a macro on a skill; it runs on the GM's client whenever the skill's rank changes.

**Tree settings**
- *Style*: theme, accent and secondary colors, skill shape, link style, row spacing, title banner, tier bar, background image and its visibility. **Apply theme defaults** resets the look to the selected theme.
  - **LANCER Tactical**: angular gunmetal panels.
  - **Cel-Shaded Tiers (Borderlands-inspired)**: ink outlines, halftone backdrop, `0/5` rank counters under each skill, chunky elbow connectors, a big title banner and a points-invested tier bar.
  - **Holographic HUD**: glowing lines and hexagons on scanlines.
  - **Hex Web**: glassy teal sectors around a glowing core, made for the radial layout.
- *Rules*:
  - **Who can use it**: every character, or only characters you grant it to (grant from the character's skill tree window).
  - **Layout**: *Grid* or *Radial web*. Radial trees have 3–8 named sectors (6 makes a hexagon) and 1–5 rings.
  - **Points per tier**: on a grid, row N needs N × this many points spent in the rows above it. On a radial web, ring N of a sector needs N × this many points spent in that sector's inner rings. 0 turns it off.

**Points**
Characters earn *Skill points per License Level* (default 1) plus *Starting skill points* (default 0). In a character's skill tree window the GM can add bonus points, grant or revoke trees, reset a tree, and turn on **Override** to unlock or refund while ignoring points and requirements.

**Sharing trees**
**Export** saves the current tree as JSON (Shift-click to export all trees); **Import** accepts a file or pasted JSON. Examples are in the `examples` folder.

## For players

Click **Skill Tree** in the header of your pilot or mech sheet (a mech opens its pilot's trees), or right-click your character in the Actors sidebar. Hover a skill for a quick summary, click it for full details, then click **Unlock** or **Upgrade**. Use **Columns** to see all your trees side by side.

The colors mean: unlocked, available, not enough points, locked. Radial webs show only icons: hover a skill for its name, or click it for details. Red padlocks need more points in that sector; blue padlocks need a prerequisite.

## Settings

| Setting | Default | |
|---|---|---|
| Skill points per License Level | 1 | NPCs use their tier |
| Starting skill points | 0 | |
| Players can unlock skills | On | Off = only the GM spends points |
| Players can refund skills | Off | |
| Announce unlocks in chat | On | |
| Skill Tree button on character sheets | On | Per user |

---

## Custom skills

Anything a passive modifier can't do is a **custom skill**: a small script registered in `scripts/custom-skills.js`. Three examples ship with the module:

- **Coolant Flush**: clears Heat at the start of each of your turns.
- **Iron Hull Doctrine**: +1 Save Target per rank, plus +1 Armor if the pilot's HULL is 2+.
- **Signature Gear**: gives the character an item while the skill is unlocked.

**To add one:** paste the skill's rules text into a chat with Claude and ask for it to be added to the module. The update goes into `scripts/custom-skills.js`; follow *Publishing updates* above (bump the version, run `./build.sh`, push). The new effect appears in the *Custom effects* dropdown for any skill.

**Without updating the module:** the same code can go in **Settings → LANCER Skill Trees → Custom Skill Scripts**, which runs it for everyone when the world loads (reload after saving). Effects that hook into LANCER attack flows must live in `custom-skills.js`.

The top of `scripts/custom-skills.js` documents everything a custom skill can do: options the GM fills in per skill, computed Active Effect changes, unlock/refund callbacks, turn and round triggers, LANCER flow steps, and the helper API.

## For macro and module authors

The API is at `game.modules.get("lancer-skill-trees").api` (also `LancerSkillTrees`):

```js
LancerSkillTrees.openTree(actor);                 // open the skill tree window
LancerSkillTrees.unlock(actor, treeId, nodeId);   // spend points, following the rules
LancerSkillTrees.setRank(actor, treeId, nodeId, 2, { force: true }); // GM only
LancerSkillTrees.getPoints(actor);                // { total, spent, available }
LancerSkillTrees.hasSkill(actor, "coolant-flush");
LancerSkillTrees.registerCustomSkill("id", { ... });
```

Hooks: `lancerSkillTrees.ready(api)` and `lancerSkillTrees.rankChanged({ actor, tree, node, rank, previousRank })`.

Data: trees are stored in the world setting `lancer-skill-trees.trees`; character progress is in `flags.lancer-skill-trees` (`ranks`, `bonusPoints`, `granted`). Each unlocked skill gets one Active Effect per scope, flagged `flags.lancer-skill-trees.key`; don't edit those by hand, they are regenerated from the tree.

---

LANCER is copyright Massif Press. This is an unofficial third-party work, not affiliated with Massif Press, published under the LANCER Third Party License. Borderlands is a trademark of Gearbox Software; the Cel-Shaded theme is an original design inspired by its skill trees.
