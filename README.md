# Roomtone

The [original Roomtone application](https://github.com/madebysourasith-sudo/roomtone/), adapted to **Next.js 16.4.4**, **React 19.3.1** and **Three.js 0.187.0**, with rendering-performance optimizations rather than a visual redesign.

**Live:** https://huangyingting.github.io/roomtone/

## Original models and settings

The interface, procedural furniture, detailed foliage, finish textures, furnished plans, camera framing, lighting curves, outdoor scenery and controls come from upstream revision [`cdcd636`](https://github.com/madebysourasith-sudo/roomtone/tree/cdcd63662c4aebb70857ba0d5e0552c73e38eb0f). The garage uses the same compressed **Khronos Car Concept** model, not a replacement car.

The original 2048² sun shadows, N8AO High settings, bloom, grading, perspective camera, time-of-day presets and `min(devicePixelRatio, 2)` resolution are retained. The original PCFSoft shadow filter is adapted to current Three.js depth textures; a small render-target compatibility bridge keeps the original N8AO 1.9.4 algorithm working on r187. Updating Three.js can still change physical-material rendering and numerical precision; this is not a claim of pixel-identical output across engine versions.

All five original furnished/apartment plans and the empty lot remain available, including room and wall editing, openings, upstairs and stairs, roofs, garden surfaces and pools, furniture finishes, individual lamps, room isolation, undo/redo, My homes and PNG export. Autosaves and named homes retain the original `roomtone.auto` and `roomtone.homes` formats.

Fonts, compressed model files and matching Draco/Basis decoders are self-hosted. Startup does not depend on third-party CDNs or model servers.

## Performance changes

- **Exact primitive geometry caching:** identical dimensions share geometry without reducing detail, rounding measurements or changing UVs. The cache is bounded.
- **Furniture batching:** compatible opaque primitives within a piece share a draw submission while retaining material roles, picking, transformations and shadows. Transparent and independently hidden meshes are excluded.
- **Shadow reuse:** unchanged shadows are not rendered again. Moving furniture, changing the architecture, wall visibility or sun position invalidates them.
- **Less per-frame CPU work:** unchanged UI, label projection and camera calculations are skipped while the original nature shaders continue.
- **Animation-aware scheduling:** native wind, water, camera easing and preview rotation remain animated. Only genuinely static isolated rooms stop rendering; hidden documents pause.
- **Less startup/readback work:** loading the real car regenerates only its catalog thumbnail, not the entire catalog a second time. Disabling drawing-buffer preservation retains synchronous snapshots and home thumbnails.
- **Lifecycle cleanup:** scheduled work, loader workers, event subscriptions and owned GPU resources are released on shutdown.

`window.__api.performance()` and canvas `data-*` attributes expose frame, draw-call, triangle, geometry-cache and shadow-update counters. **Whole-home idle is intentionally not zero frames:** stopping the original wind would change the website's behavior.

### Measured against upstream

A Chromium comparison at 1280×800, DPR 1, the furnished One-bedroom plan, 14:00 and camera azimuth/elevation −0.5/0.64 produced:

| Steady animated frame | Original r170 | Optimized r187 |
|---|---:|---:|
| Draw submissions across all composer passes | 1,731 | 637 |
| Submitted triangles, including shadow work | 608,023 | 308,676 |
| Resident geometries | 722 | 621 |

That is **63.2% fewer draw submissions** and **14.0% fewer resident geometries** in this scene. The original state, all 75 catalog definitions, plans, camera values and complete AO configuration were compared and matched. Both scenes used the same original detailed model assets; the savings include avoiding redundant shadow submissions, not removing geometry or lowering resolution. Wind remained active. These are rendering-work counters, not a hardware-FPS claim.

## Run and verify

Requires Node.js 20.9+; CI uses Node.js 24.

```sh
npm ci
npm run dev
```

Open http://localhost:3000.

```sh
npx playwright install chromium
npm run verify
```

Verification includes lint, type checking, focused geometry/deployment unit tests, production static export and Playwright Chromium scenarios for original-model loading, settings, editing, finishes, lighting, saves, snapshots, animation/shadow reuse, static-room rendering, visibility, mobile resolution and context loss. SwiftShader enables browser verification on hosts without a GPU; its timings are not hardware-FPS measurements.

To exercise GitHub Pages project-path routing:

```sh
NEXT_PUBLIC_BASE_PATH=/roomtone npm run build
NEXT_PUBLIC_BASE_PATH=/roomtone npm run test:e2e
```

`npm run serve` serves `out/` at port 4173. Use the same `NEXT_PUBLIC_BASE_PATH` as the build.

## Publish

Every push to `main` runs verification and deploys the static export through GitHub Actions. The workflow obtains the correct base path from GitHub Pages.

```sh
gh auth login
npm run publish
```

Run publication from a clean, committed `main`. The script pushes, configures Pages, waits for the deployment, checks live assets and runs Playwright against the published URL. It refuses to overwrite an unrelated remote or change repository visibility, and does not report failed workflows or browser checks as successful.

## Attribution and licensing

Original application: [madebysourasith-sudo/roomtone](https://github.com/madebysourasith-sudo/roomtone/). Upstream does not provide a general license; this repository does **not** relicense its code. The MIT license covers only independently authored integration and optimization code.

Car Concept: copyright 2024 Darmstadt Graphics Group GmbH, **CC BY 4.0**. Original font licenses, decoder notices and model attribution are included. See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) and [the model attribution](public/models/car/ATTRIBUTION.md).
