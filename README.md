# Roomtone

A relaxing, isometric home builder made with **Next.js 16.4.4**, **React 19.3.1** and **Three.js 0.187.0**. Inspired by the interactions and warm architectural presentation of [the original Roomtone](https://github.com/madebysourasith-sudo/roomtone/). This is an independent implementation, not a copy of its unlicensed source or assets. All furniture, foliage, textures and catalog illustrations are generated locally.

## Design your home

- Start on an empty lot or choose Studio, One-bedroom, Family home, Courtyard or a two-story Townhouse.
- Draw rooms on a half-meter grid; move and resize rooms with their contents.
- Place doors, windows, glass doors and garage doors in walls.
- Furnish with 63 pieces across Living, Bedroom, Kitchen, Bath, Garage and Garden. Move, rotate, recolor and resize pieces; kitchen counters lengthen without changing depth or height.
- Choose timber, tile, brick, paint and wallpaper finishes for floors, walls and the exterior.
- Create gardens with trees, pools, decks, paths, flower beds, fences and hedges.
- Build upstairs, add stairs, toggle roofs and focus individual rooms.
- Change the time of day and see warm windows at night.
- Undo/redo, autosave, save up to 30 home copies, import/export validated JSON files and download scene snapshots.

**Controls:** click to select/place; drag selected furniture or rooms to move; right-drag to orbit; wheel to zoom; Shift-drag to pan; two fingers to orbit/pinch on touchscreens. `R` rotates, `Esc` cancels, `Delete` removes, `Ctrl/⌘ Z` undoes, `Ctrl/⌘ Shift Z` redoes. Double-click a room floor to isolate it. Room dimensions and positions can also be edited precisely in the panel.

Saved homes stay in this browser's local storage. Export JSON for backups or moving between devices. The app reports storage and invalid-file errors instead of silently losing a design. Room removal also removes its furniture and openings. Furniture must fit within a room; garden pieces belong on the ground-floor lot. Rooms cannot overlap on the same floor. Furniture may overlap intentionally (for example, rugs beneath tables).

## Run locally

Requires Node.js 20.9+; Node.js 24 is used in CI.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. No remote fonts, models, CDNs, backend or API keys are required.

## Verify

```sh
npx playwright install chromium
npm run verify
```

This runs lint, strict type checking, model tests, a production static export and Chromium browser tests against that export. Tests exercise editing, persistence, import validation, mobile layout, snapshots and demand-rendering budgets. Browser runs use SwiftShader when no physical GPU is available.

To test GitHub Pages project-path routing locally:

```sh
NEXT_PUBLIC_BASE_PATH=/roomtone npm run build
NEXT_PUBLIC_BASE_PATH=/roomtone npm run test:e2e
```

`npm run serve` serves the `out/` directory at port 4173. Set `NEXT_PUBLIC_BASE_PATH` to the same value used to build it.

## Rendering performance

The viewport renders **on demand**, coalescing invalidations into one frame. There is no continuous animation loop or idle GPU work. Geometry, materials and procedural textures are shared; static shadows update only after scene or light changes. The renderer pauses while the document is hidden and caps pixel density (balanced: 1.5 desktop / 1.25 mobile, lightweight: 1, high: 2). All GPU resources and event listeners are released on unmount. The 3D module is lazy-loaded separately from the interface.

Canvas `data-frames`, `data-draw-calls`, `data-triangles` and `data-dpr` expose measurable rendering statistics. The furnished One-bedroom plan is checked against **fewer than 500 draw calls**, **fewer than 150,000 triangles**, and **zero new frames over 1.2 seconds of idle time**. Desktop and mobile pixel-density caps are verified with a 2× device scale. Browser timings under software rendering are not representative of hardware FPS.

## Publish to GitHub Pages

The included workflow verifies and publishes the static export on every push to `main`. Pages base paths are obtained from `actions/configure-pages`, so both repository sites and account-root sites work.

With an authenticated GitHub CLI account:

```sh
gh auth login
npm run publish
```

Run publication from a clean, committed `main` branch after `npm run verify`. The script uses your authenticated account, creates the public `roomtone` repository if needed, configures Pages for GitHub Actions, pushes through the CLI's credential helper without changing global Git settings, waits for the deployment workflow, checks the live HTML and JavaScript assets, and runs the full browser suite against the live URL. It refuses to overwrite an unrelated remote or change a private repository's visibility. Authentication, permissions, failed workflows, inaccessible assets and browser failures are explicit errors, never reported as successful publication.

Use `npm run publish -- another-repository-name` for a different repository. Creating a Pages site requires repository administration permission; pushing this workflow also requires workflow-write authorization. If needed, run `gh auth refresh --scopes repo,workflow` and complete GitHub's browser approval. The expected default URL for the current account is `https://huangyingting.github.io/roomtone/`; it is not live until publication actually succeeds.

## Attribution

Concept inspiration: [madebysourasith-sudo/roomtone](https://github.com/madebysourasith-sudo/roomtone/). No upstream source, screenshots, fonts or models are shipped. This project's original source is MIT licensed.
