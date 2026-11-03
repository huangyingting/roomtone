import { test } from "node:test";
import assert from "node:assert/strict";
import { addOpening, clone, createPlan, moveRoom, parseHome, pieceError, PLAN_NAMES, removeEntity, roomError, snap } from "../src/lib/model.ts";
import { CATALOG, CATALOG_BY_ID } from "../src/lib/catalog.ts";
import { historyReducer, initialHistory } from "../src/lib/history.ts";

test("all five furnished templates and empty lot round-trip through validation", () => {
  for (const name of PLAN_NAMES) {
    const home = createPlan(name);
    assert.deepEqual(parseHome(JSON.parse(JSON.stringify(home))), home, name);
  }
});
test("catalog contains at least 60 distinct original pieces", () => {
  assert.ok(CATALOG.length >= 60);
  assert.equal(CATALOG_BY_ID.size, CATALOG.length);
});
test("room drawing snaps and prevents overlap or leaving the lot", () => {
  assert.equal(snap(2.26), 2.5);
  const home = createPlan("Studio"), base = home.rooms[0];
  assert.match(roomError(home, { ...base, id: "new", x: 0 })!, /overlap/);
  assert.match(roomError(home, { ...base, x: 9 }, base.id)!, /inside/);
  assert.match(roomError(home, { ...base, width: 0.5 }, base.id)!, /at least/);
  assert.equal(roomError(home, { ...base, id: "next", x: -10, width: 6 }), null);
});
test("moving rooms moves furniture and preserves relative offsets", () => {
  const home = createPlan("One-bedroom"), room = home.rooms[1];
  const bed = home.pieces.find((p) => p.catalogId === "double-bed")!;
  const next = moveRoom(home, room.id, { x: -6, z: -3.5 });
  assert.equal(next.pieces.find((p) => p.id === bed.id)!.x, bed.x - 1);
  assert.equal(home.rooms[1].x, -5);
  assert.throws(() => moveRoom(home, room.id, { x: -3, z: -3.5 }), /overlap/);
});
test("furniture bounds use the full rotated and scaled footprint", () => {
  const home = createPlan("Studio"), bed = home.pieces.find((p) => p.catalogId === "double-bed")!;
  assert.equal(pieceError(home, bed), null);
  assert.match(pieceError(home, { ...bed, x: 9.5 })!, /whole piece/);
  assert.match(pieceError(home, { ...bed, z: -2.5 })!, /fit inside/);
  assert.match(pieceError(home, { ...bed, x: -3.2, rotation: 45 })!, /fit inside/);
  assert.match(pieceError(home, { ...bed, scale: 3 })!, /fit inside/);
  const tree = home.pieces.find((p) => p.catalogId === "olive-tree")!;
  assert.match(pieceError(home, { ...tree, floor: 1 })!, /ground floor/);
});
test("kitchen counters lengthen without growing deeper", () => {
  const home = createPlan("Studio");
  const counter = home.pieces.find((p) => p.catalogId === "kitchen-counter")!;
  assert.equal(pieceError(home, { ...counter, x: -1, z: -2.6, scale: 2 }), null);
  assert.match(pieceError(home, { ...counter, x: -1, z: -2.6, scale: 2, rotation: 90 })!, /fit inside/);
});
test("openings attach to walls, need space and cannot overlap", () => {
  const home = createPlan("Studio"), r = home.rooms[0];
  const next = addOpening(home, { x: r.x + 1, z: r.z }, 0, "door");
  assert.equal(next.openings.length, home.openings.length + 1);
  assert.equal(next.openings.at(-1)!.wall, "north");
  assert.throws(() => addOpening(next, { x: r.x + 1, z: r.z }, 0, "door"), /already/);
  assert.throws(() => addOpening(home, { x: 9, z: 7 }, 0, "door"), /near a wall/);
});
test("openings that exactly fit a wall stay in bounds after snapping", () => {
  const home = createPlan("Empty lot");
  home.rooms.push({ id: "garage", name: "Garage", x: 0, z: 0, width: 2.5, depth: 4, floor: 0, floorFinish: 0, wallFinish: 6 });
  const next = addOpening(home, { x: 1.25, z: 0 }, 0, "garage-door");
  assert.equal(next.openings[0].offset, 1.25);
  assert.deepEqual(parseHome(next), next);
});
test("removing a room removes its contents and attached openings", () => {
  const home = createPlan("Studio"), room = home.rooms[0];
  const next = removeEntity(home, room.id);
  assert.ok(!next.rooms.some((r) => r.id === room.id));
  assert.ok(!next.openings.some((o) => o.roomId === room.id));
  assert.ok(!next.pieces.some((p) => p.catalogId === "double-bed"));
  assert.ok(next.pieces.some((p) => p.catalogId === "olive-tree"));
});
test("untrusted home files reject corrupt data and duplicate identifiers", () => {
  assert.throws(() => parseHome({}), /supported/);
  const home = createPlan("Studio"), invalid = clone(home);
  invalid.pieces[0].catalogId = "unknown";
  assert.throws(() => parseHome(invalid), /invalid furniture/);
  invalid.pieces = clone(home.pieces); invalid.rooms[0].width = NaN;
  assert.throws(() => parseHome(invalid), /invalid room/);
  invalid.rooms = clone(home.rooms); invalid.pieces[0].id = invalid.rooms[0].id;
  assert.throws(() => parseHome(invalid), /duplicate/);
  const badOpening = clone(home); badOpening.openings[0].offset = 999;
  assert.throws(() => parseHome(badOpening), /outside its wall/);
  const tooMany = clone(home); tooMany.pieces = Array(1501).fill(home.pieces[0]);
  assert.throws(() => parseHome(tooMany), /supported/);
  const overlapping = clone(home); overlapping.openings.push({ ...overlapping.openings[0], id: "overlap" });
  assert.throws(() => parseHome(overlapping), /overlapping wall/);
});
test("undo/redo is reversible, branches clear redo and history stays bounded", () => {
  const first = createPlan("Studio"), second = createPlan("One-bedroom");
  let state = historyReducer(initialHistory, { type: "load", home: first });
  state = historyReducer(state, { type: "commit", home: second });
  state = historyReducer(state, { type: "undo" });
  assert.equal(state.home, first);
  state = historyReducer(state, { type: "redo" });
  assert.equal(state.home, second);
  state = historyReducer(state, { type: "undo" });
  state = historyReducer(state, { type: "commit", home: createPlan("Empty lot") });
  assert.equal(state.future.length, 0);
  for (let i = 0; i < 60; i++) state = historyReducer(state, { type: "commit", home: { ...first, name: `Home ${i}` } });
  assert.equal(state.past.length, 50);
});
