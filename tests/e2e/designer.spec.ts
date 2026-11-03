import { expect, test, type Page } from "@playwright/test";
import { createPlan, type Home } from "../../src/lib/model";
import { AUTOSAVE_KEY } from "../../src/lib/storage";
import { OrthographicCamera, Vector3 } from "three";

async function load(page: Page) {
  await page.goto("./");
  const canvas = page.getByTestId("scene-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("button", { name: "Download snapshot", exact: true })).toBeEnabled();
  await expect(page.locator(".toast-error, .scene-loading[role='alert']")).toHaveCount(0);
  return canvas;
}
async function saved(page: Page): Promise<Home> {
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), AUTOSAVE_KEY);
}
async function importHome(page: Page, home: Home) {
  await page.getByLabel("Import home file").setInputFiles({ name: "home.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(home)) });
  await expect(page.getByLabel("Home name", { exact: true })).toHaveValue(home.name);
  await saved(page);
}
async function dismissToast(page: Page) {
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismiss.isVisible()) await dismiss.click();
}
async function project(page: Page, x: number, y: number, z: number) {
  const bounds = (await page.getByTestId("scene-canvas").boundingBox())!;
  const aspect = Math.round(bounds.width) / Math.round(bounds.height);
  const height = Math.max(23, 31 / aspect);
  const camera = new OrthographicCamera(-height * aspect / 2, height * aspect / 2, height / 2, -height / 2, 0.1, 180);
  camera.position.set(-18, 17, 22);
  camera.lookAt(0, 0.8, 0);
  camera.updateMatrixWorld();
  const point = new Vector3(x, y, z).project(camera);
  return { x: bounds.x + (point.x + 1) * bounds.width / 2, y: bounds.y + (1 - point.y) * bounds.height / 2 };
}
function emptyRoom(): Home {
  const home = createPlan("Empty lot");
  home.name = "Interaction test";
  home.rooms.push({ id: "interaction-room", name: "Living", x: -4, z: -4, width: 8, depth: 8, floor: 0, floorFinish: 0, wallFinish: 6 });
  return home;
}

test("furnished scene loads without errors, external requests or idle rendering", async ({ page }, testInfo) => {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith(testInfo.project.use.baseURL!.toString().replace(/\/roomtone\/$/, "/")) && !request.url().startsWith("data:")) external.push(request.url());
  });
  const canvas = await load(page);
  await saved(page);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(350);
  const start = Number(await canvas.getAttribute("data-frames"));
  expect(start).toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  expect(Number(await canvas.getAttribute("data-frames"))).toBe(start);
  expect(Number(await canvas.getAttribute("data-dpr"))).toBe(1.5);
  expect(Number(await canvas.getAttribute("data-draw-calls"))).toBeLessThan(500);
  expect(Number(await canvas.getAttribute("data-triangles"))).toBeLessThan(150_000);
  await testInfo.attach("rendering-metrics", { body: JSON.stringify(await canvas.evaluate((element) => ({ ...element.dataset }))), contentType: "application/json" });
  await page.getByRole("button", { name: "Lighting", exact: true }).click();
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await expect.poll(async () => Number(await canvas.getAttribute("data-frames"))).toBeGreaterThan(start);
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await page.getByRole("button", { name: "Furnish", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("desktop.png") });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("place, recolor, resize, rotate, move, delete, undo and redo furniture", async ({ page }) => {
  const canvas = await load(page), home = createPlan("Empty lot");
  home.name = "Furniture test";
  home.rooms.push({ id: "test-room", name: "Living", x: -4, z: -4, width: 8, depth: 8, floor: 0, floorFinish: 0, wallFinish: 6 });
  await importHome(page, home);
  await dismissToast(page);
  await page.getByRole("button", { name: "Place Side table", exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  expect((await saved(page)).pieces).toHaveLength(1);
  await page.keyboard.press("Escape");
  // The tabletop projects above its ground-plane placement point.
  await canvas.click({ position: { x: box.width / 2 + 5, y: box.height / 2 - 15 } });
  await expect(page.getByLabel("Piece color")).toBeVisible();
  await page.getByLabel("Piece color").fill("#aa8877");
  await page.getByLabel("Piece size").fill("1.2");
  await page.getByRole("button", { name: "Rotate selected piece" }).click();
  await page.getByLabel("Piece x", { exact: true }).fill("1");
  let stored = await saved(page);
  expect(stored.pieces[0]).toMatchObject({ color: "#aa8877", scale: 1.2, rotation: 90, x: 1 });
  await page.getByRole("button", { name: "Select and move", exact: true }).click();
  await page.keyboard.press("Delete");
  expect((await saved(page)).pieces).toHaveLength(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  stored = await saved(page); expect(stored.pieces).toHaveLength(1);
  await page.keyboard.press("Control+Shift+z");
  expect((await saved(page)).pieces).toHaveLength(0);
});

test("draw, resize and move a room, style it, and add upstairs", async ({ page }) => {
  const canvas = await load(page);
  await importHome(page, createPlan("Empty lot"));
  await dismissToast(page);
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "Draw a room", exact: false }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 - 25, box.y + box.height / 2 - 65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 65, { steps: 8 });
  await page.mouse.up();
  expect((await saved(page)).rooms).toHaveLength(1);
  await page.getByLabel("Room name", { exact: true }).fill("My studio");
  await page.getByLabel("Room width", { exact: true }).fill("4");
  await page.getByLabel("Room depth", { exact: true }).fill("4");
  await page.getByLabel("Room x", { exact: true }).fill("-2");
  await page.getByLabel("Room z", { exact: true }).fill("-2");
  expect((await saved(page)).rooms[0]).toMatchObject({ name: "My studio", width: 4, depth: 4, x: -2, z: -2 });
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await page.getByRole("button", { name: "Sage tile", exact: true }).click();
  await page.getByRole("button", { name: "Apply to selected room", exact: true }).click();
  expect((await saved(page)).rooms[0].floorFinish).toBe(4);
  await page.getByRole("button", { name: "Walls", exact: true }).click();
  await page.getByRole("button", { name: "Clay", exact: true }).click();
  await page.getByRole("button", { name: "Apply to selected room", exact: true }).click();
  expect((await saved(page)).rooms[0].wallFinish).toBe(8);
  await page.getByRole("button", { name: "Outside", exact: true }).click();
  await page.getByRole("button", { name: "Brick", exact: true }).click();
  await page.getByRole("button", { name: "Apply to exterior", exact: true }).click();
  expect((await saved(page)).exteriorFinish).toBe(9);
  await page.getByRole("button", { name: "Switch floor", exact: true }).click();
  await expect(page.locator(".view-badge")).toContainText("Upstairs");
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "Draw a room", exact: false }).click();
  await page.mouse.move(box.x + box.width / 2 - 25, box.y + box.height / 2 - 65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 65, { steps: 8 });
  await page.mouse.up();
  expect((await saved(page)).rooms.map((r) => r.floor)).toEqual([0, 1]);
  await page.getByRole("button", { name: "Toggle roof", exact: true }).click();
  await expect(page.getByRole("button", { name: "Toggle roof", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("saved homes, portable exports, imports and reload persistence", async ({ page }) => {
  await load(page);
  await page.getByLabel("Home name", { exact: true }).fill("My quiet home");
  await saved(page);
  await page.getByRole("button", { name: "Save home", exact: true }).click();
  await page.getByRole("button", { name: "Choose a floor plan", exact: true }).click();
  await page.getByRole("button", { name: /Empty lot Let your imagination/ }).click();
  expect((await saved(page)).rooms).toHaveLength(0);
  await page.getByRole("button", { name: "Saved homes", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByLabel("Home name", { exact: true })).toHaveValue("My quiet home");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export home", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("roomtone-home.json");
  await saved(page); await page.reload();
  await expect(page.getByLabel("Home name", { exact: true })).toHaveValue("My quiet home");
});

test("invalid imports and corrupted autosaves surface errors without overwriting data", async ({ page }) => {
  await load(page);
  const before = await saved(page);
  await page.getByLabel("Import home file").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"version":1}') });
  await expect(page.locator(".toast-error")).toContainText("Import failed");
  expect((await saved(page)).rooms).toEqual(before.rooms);
  await page.addInitScript((key) => localStorage.setItem(key, "{broken"), AUTOSAVE_KEY);
  await page.reload();
  await expect(page.locator(".toast-error")).toContainText("Autosave could not be restored");
  await page.waitForTimeout(800);
  expect(await page.evaluate((key) => localStorage.getItem(key), AUTOSAVE_KEY)).toBe("{broken");
});

test("snapshots are real PNGs and room focus, lighting and quality update", async ({ page }, testInfo) => {
  const canvas = await load(page);
  await page.getByLabel("Focus room", { exact: true }).selectOption({ label: "Bedroom" });
  await expect(page.getByText("Room view · double-click to return")).toBeVisible();
  await page.getByLabel("Focus room", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Lighting", exact: true }).click();
  await page.getByLabel("Rendering quality", { exact: true }).selectOption("low");
  await expect(canvas).toHaveAttribute("data-dpr", "1");
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("night.png") });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download snapshot", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("roomtone-home.png");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.length).toBeGreaterThan(10_000);
});

test("mobile layout fits, controls remain usable, and balanced DPR is capped", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const canvas = await load(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(Number(await canvas.getAttribute("data-dpr"))).toBe(1.25);
  const panelBounds = (await page.getByRole("complementary", { name: "Designer panel" }).boundingBox())!;
  for (const tab of ["Layout", "Furnish", "Style", "Decorate", "Lighting"]) {
    const bounds = (await page.getByRole("button", { name: tab, exact: true }).boundingBox())!;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(panelBounds.x + panelBounds.width);
  }
  await page.getByRole("button", { name: "Lighting", exact: true }).click();
  await expect(page.getByLabel("Time of day")).toBeVisible();
  await page.getByRole("button", { name: "Decorate", exact: true }).click();
  await page.getByLabel("Search furniture").fill("tree");
  await expect(page.getByRole("button", { name: "Place Olive tree", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mobile.png") });
  await page.getByRole("button", { name: "Hide designer", exact: false }).click();
  await expect(page.getByRole("complementary", { name: "Designer panel" })).not.toBeVisible();
  await page.getByRole("button", { name: "Open designer", exact: false }).click();
  await expect(page.getByRole("complementary", { name: "Designer panel" })).toBeVisible();
  await page.getByRole("button", { name: "Help and controls", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("all opening types attach to walls and garden pieces place outdoors", async ({ page }) => {
  await load(page);
  await importHome(page, emptyRoom());
  await dismissToast(page);
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  for (const opening of [
    { name: "door", x: 0, z: -4 },
    { name: "window", x: 4, z: 0 },
    { name: "glass door", x: 2, z: -4 },
    { name: "garage door", x: 4, z: -2 },
  ]) {
    await page.getByRole("button", { name: opening.name, exact: true }).click();
    const point = await project(page, opening.x, 1.6, opening.z);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(".toast-error")).toHaveCount(0);
    expect((await saved(page)).openings.at(-1)!.type).toBe(opening.name.replaceAll(" ", "-"));
  }
  await page.getByRole("button", { name: "Decorate", exact: true }).click();
  await page.getByRole("button", { name: "Place Olive tree", exact: true }).click();
  const garden = await project(page, 7, 0.08, 3);
  await page.mouse.click(garden.x, garden.y);
  expect((await saved(page)).pieces[0]).toMatchObject({ catalogId: "olive-tree", x: 7, z: 3, floor: 0 });
});

test("pointer dragging moves selected furniture and rooms with their contents", async ({ page }) => {
  await load(page);
  await importHome(page, emptyRoom());
  await dismissToast(page);
  await page.getByRole("button", { name: "Place Side table", exact: true }).click();
  const ground = await project(page, 0, 0.08, 0);
  await page.mouse.click(ground.x, ground.y);
  expect((await saved(page)).pieces[0]).toMatchObject({ x: 0, z: 0 });
  await page.getByRole("button", { name: "Select and move", exact: true }).click();
  const start = await project(page, 0, 0.6, 0), end = await project(page, 1.5, 0.6, 1);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  expect((await saved(page)).pieces[0]).toMatchObject({ x: 1.5, z: 1 });
  const floor = await project(page, -2, 0.08, -2);
  await page.mouse.click(floor.x, floor.y);
  await expect(page.getByLabel("Room name", { exact: true })).toBeVisible();
  const roomEnd = await project(page, -3, 0.08, -2);
  await page.mouse.move(floor.x, floor.y);
  await page.mouse.down();
  await page.mouse.move(roomEnd.x, roomEnd.y, { steps: 8 });
  await page.mouse.up();
  const home = await saved(page);
  expect(home.rooms[0]).toMatchObject({ x: -5, z: -4 });
  expect(home.pieces[0]).toMatchObject({ x: 0.5, z: 1 });
});

test("lost WebGL context reports a recovery path while keeping export available", async ({ page }) => {
  const canvas = await load(page);
  await canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext("webgl2");
    const extension = context?.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("This browser does not expose the context-loss test extension.");
    extension.loseContext();
  });
  await expect(page.locator(".scene-loading[role='alert']")).toContainText(/context.*lost/i);
  await expect(page.getByRole("button", { name: "Export home", exact: true })).toBeEnabled();
});

test("removing a focused room returns to whole-home view", async ({ page }) => {
  await load(page);
  await importHome(page, emptyRoom());
  await dismissToast(page);
  await page.getByLabel("Focus room", { exact: true }).selectOption("interaction-room");
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("button", { name: "Living 8 × 8 m", exact: true }).click();
  await page.getByRole("button", { name: "Remove room & contents", exact: true }).click();
  expect((await saved(page)).rooms).toHaveLength(0);
  await expect(page.getByLabel("Focus room", { exact: true })).toHaveValue("");
  await expect(page.getByText("Room view · double-click to return")).not.toBeVisible();
});
