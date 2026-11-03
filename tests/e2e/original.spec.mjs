import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

let errors;
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
});
test.afterEach(() => expect(errors).toEqual([]));

async function boot(page) {
  await page.goto("./?nointro");
  await expect(page.locator("#loading")).toHaveCount(0, { timeout: 90_000 });
  await expect(page.locator("#gl")).toHaveAttribute("data-car-ready", "true", { timeout: 60_000 });
}

test("original plans, catalog, compressed car and render settings load without external requests", async ({ page, baseURL }) => {
  const external = [];
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL).origin) external.push(request.url());
  });
  await boot(page);
  await expect(page.locator("#nav button")).toHaveText(["Layout", "Furnish", "Style", "Decorate", "Lighting"]);
  const original = await page.evaluate(() => {
    const a = window.__api, ao = a.ao.configuration;
    let compressed = 0;
    const car = a.state.items.find(item => item.k === "car");
    a.OBJ[car.id].traverse(mesh => { if (mesh.material?.map?.isCompressedTexture) compressed++; });
    return {
      plan: a.state.plan, time: a.state.t, pieces: a.state.items.length,
      catalog: Object.keys(a.CAT).length, plans: Object.keys(a.PLANS),
      ao: [ao.aoRadius, ao.distanceFalloff, ao.intensity, ao.halfRes, ao.depthAwareUpsampling, ao.gammaCorrection],
      compressed, performance: a.performance(),
    };
  });
  expect(original).toMatchObject({
    plan: "onebed", time: 8.5, pieces: 56, catalog: 75,
    plans: ["studio", "onebed", "twobed", "threebed", "loft"],
    ao: [1.8, 1.2, 4.5, true, true, false],
    performance: { three: "187", preserveDrawingBuffer: false },
  });
  expect(original.compressed).toBeGreaterThan(0);
  expect(original.performance.cacheHits).toBeGreaterThan(500);
  expect(original.performance.batchedMeshes).toBeGreaterThan(200);
  expect(external).toEqual([]);
});

test("original furniture picking, card finishes, rotation, movement and undo survive batching", async ({ page }) => {
  await boot(page);
  const { id, frames } = await page.evaluate(() => {
    const a = window.__api, frames = a.performance().frames;
    a.usePlan("studio"); a.view({ az: -.5, el: .8 });
    return { id: a.add("sofa2", 2.5, 3), frames };
  });
  expect(id).toBeTruthy();
  await expect.poll(() => page.evaluate(() => window.__api.performance().frames), { timeout: 20_000 }).toBeGreaterThan(frames);
  const [x, y] = await page.evaluate(id => window.__api.screen(id), id);
  await page.mouse.click(x, y);
  await expect(page.locator("#card")).toHaveClass(/show/);
  await expect(page.locator("#card header b")).toHaveText("Sofa, two-seat");
  const old = await page.evaluate(id => window.__api.state.items.find(item => item.id === id), id);
  await page.locator("#card .fin [data-mat]:not(.on)").first().click();
  const changed = await page.evaluate(id => window.__api.state.items.find(item => item.id === id), id);
  expect(changed.v).not.toEqual(old.v);
  await page.locator('#card [data-a="rot"]').click();
  await expect.poll(() => page.evaluate(id => window.__api.state.items.find(item => item.id === id).r, id)).toBeCloseTo(Math.PI / 4);
  await page.locator('#card [data-a="move"]').click();
  const target = await page.evaluate(() => window.__api.proj(3, 0, 4.5));
  await page.mouse.move(...target);
  await page.mouse.click(...target);
  await expect.poll(() => page.evaluate(id => window.__api.state.items.find(item => item.id === id).z, id)).toBeGreaterThan(4);
  await page.keyboard.press("Control+z");
  await expect.poll(() => page.evaluate(id => window.__api.state.items.find(item => item.id === id).z, id)).toBeCloseTo(3);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => page.evaluate(id => window.__api.state.items.find(item => item.id === id).z, id)).toBeGreaterThan(4);
});

test("original catalog placement and cancellation use the real furniture models", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__api.usePlan("studio"));
  const before = await page.evaluate(() => window.__api.state.items.length);
  await page.locator('.it[data-k="pouf"]').focus();
  await page.keyboard.press("Enter");
  const target = await page.evaluate(() => window.__api.proj(2.5, 0, 3));
  await page.mouse.move(...target);
  await page.mouse.click(...target);
  await expect.poll(() => page.evaluate(() => window.__api.state.items.length)).toBe(before + 1);
  await page.locator('.it[data-k="pouf"]').focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__api.state.items.length)).toBe(before + 1);
});

test("original rooms, upstairs, roofs and garden water remain editable", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.__api.usePlan("blank"); window.__api.addRoom([0, 0, 8, 6], "living"); window.__api.exitBuild(); });
  expect(await page.evaluate(() => window.__api.state.lay.rooms.length)).toBe(1);
  await page.evaluate(() => window.__api.addFloor());
  expect(await page.evaluate(() => window.__api.LV().length)).toBe(2);
  expect(await page.evaluate(() => window.__api.state.items.some(item => item.k === "stairs"))).toBe(true);
  await page.evaluate(() => { window.__api.setLevel(0); window.__api.setTab("layout"); });
  await page.locator(".roofrow").getByRole("button", { name: "Flat", exact: true }).click();
  expect(await page.evaluate(() => ({ roof: window.__api.state.roof, outside: window.__api.outside() }))).toEqual({ roof: "flat", outside: true });
  await page.evaluate(() => { window.__api.removeFloor(); window.__api.setOutside(false); });
  expect(await page.evaluate(() => window.__api.LV().length)).toBe(1);
  const pool = await page.evaluate(() => {
    const a = window.__api, q = [-3, -3, 0, -1];
    const reason = a.yardWhy("pool", q);
    if (!reason) a.addYard("pool", q);
    return { reason, surfaces: a.state.yard.s };
  });
  expect(pool.reason).toBeNull();
  expect(pool.surfaces.some(surface => surface[0] === "pool")).toBe(true);
});

test("original lighting, lamp controls and surface finish animations still work", async ({ page }) => {
  await boot(page);
  await page.locator('#nav [data-k="lighting"]').click();
  await page.getByRole("button", { name: /Ink night/ }).click();
  await expect(page.locator("body")).toHaveClass(/night/, { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.__api.state.t)).toBeCloseTo(22.5);
  const id = await page.evaluate(() => {
    const a = window.__api, lamp = a.state.items.find(item => item.k === "floorlamp");
    a.select(lamp);
    return lamp.id;
  });
  await expect(page.locator('#card [data-a="tog"]')).toBeVisible();
  await page.locator('#card [data-a="tog"]').click();
  expect(await page.evaluate(id => window.__api.state.items.find(item => item.id === id).lamp.on, id)).toBe(false);
  expect(await page.evaluate(() => window.__api.applyFinish("walnut", { surf: "f:living" }))).toBe(true);
  expect(await page.evaluate(() => window.__api.state.surf["f:living"])).toBe("walnut");
  await page.evaluate(() => window.__api.time(8.5));
  await expect(page.locator("body")).not.toHaveClass(/night/);
});

test("original autosave, named homes, thumbnails and PNG export are preserved", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.__api.usePlan("studio"); window.__api.add("pouf", 2, 3); window.__api.saveHome(true); });
  const saved = await page.evaluate(() => ({ auto: JSON.parse(localStorage.getItem("roomtone.auto")), homes: window.__api.homes() }));
  expect(saved.auto.items.some(item => item.k === "pouf")).toBe(true);
  expect(saved.homes).toHaveLength(1);
  expect(saved.homes[0].thumb).toMatch(/^data:image\/jpeg;base64,/);
  await page.reload();
  await expect(page.locator("#loading")).toHaveCount(0, { timeout: 90_000 });
  expect(await page.evaluate(() => window.__api.state.items.some(item => item.k === "pouf"))).toBe(true);
  await page.evaluate(() => { window.__api.usePlan("onebed"); window.__api.openHome(window.__api.homes()[0].id); });
  expect(await page.evaluate(() => window.__api.state.plan)).toBe("studio");
  const download = page.waitForEvent("download");
  await page.locator("#bPng").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("roomtone.png");
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.length).toBeGreaterThan(50_000);
});

test("native wind continues while unchanged shadows and static room frames are reused", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.__api.usePlan("onebed"); window.__api.time(14); window.__api.view({ az: -.5, el: .64 }); });
  await page.waitForTimeout(1000);
  const start = await page.evaluate(() => window.__api.performance());
  await page.waitForTimeout(1200);
  const end = await page.evaluate(() => window.__api.performance());
  expect(end.animated).toBe(true);
  expect(end.frames).toBeGreaterThan(start.frames);
  expect(end.shadowUpdates).toBe(start.shadowUpdates);
  expect(end.drawCalls).toBeLessThan(750);
  await page.evaluate(() => window.__api.setFocus("bed"));
  await expect.poll(() => page.evaluate(() => window.__api.performance().animated), { timeout: 15_000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => {
    const { cam, camG } = window.__api;
    return Object.keys(cam).every(key => Math.abs(camG[key] - cam[key]) <= 1e-4);
  }), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1000);
  const idle = await page.evaluate(() => window.__api.performance().frames);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__api.performance().frames)).toBe(idle);
  await page.locator("#bGrid").click();
  await expect.poll(() => page.evaluate(() => window.__api.performance().frames)).toBeGreaterThan(idle);
});

test("hidden documents stop rendering and resume with the original animations", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const frames = await page.evaluate(() => window.__api.performance().frames);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__api.performance().frames)).toBe(frames);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => window.__api.performance().frames)).toBeGreaterThan(frames);
});

test.describe("original responsive resolution", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  test("keeps the original 2x DPR cap and dock on narrow screens", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#gl")).toHaveAttribute("data-dpr", "2");
    const box = await page.locator("#dock").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
    await page.locator('#nav [data-k="furnish"]').click();
    await expect(page.getByRole("textbox", { name: "Search the catalog" })).toBeVisible();
  });
});

test("context loss stops rendering and explains how to recover without clearing saves", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.__api.usePlan("onebed"); document.querySelector("#gl").dispatchEvent(new Event("webglcontextlost", { cancelable: true })); });
  await expect(page.getByRole("alert").filter({ hasText: "The WebGL context was lost" })).toBeVisible();
  expect(await page.evaluate(() => ({ stopped: !window.__api, saved: !!localStorage.getItem("roomtone.auto") }))).toEqual({ stopped: true, saved: true });
});
