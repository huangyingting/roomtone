import { test } from "node:test";
import assert from "node:assert/strict";
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { batchPrimitives, createGeometryCache, visibleAnimation } from "../src/lib/render-performance.js";

test("primitive geometry is reused without approximating dimensions and is disposed once", () => {
  const cache = createGeometryCache();
  const first = cache.get("box:1,2,3", () => new BoxGeometry(1, 2, 3));
  assert.equal(cache.get("box:1,2,3", () => assert.fail("cache miss")), first);
  assert.notEqual(cache.get("box:1,2,3.001", () => new BoxGeometry(1, 2, 3.001)), first);
  assert.equal(cache.hits, 1);
  let disposed = 0;
  first.addEventListener("dispose", () => disposed++);
  cache.dispose(); cache.dispose();
  assert.equal(disposed, 1);
});
test("geometry caching is bounded and uncached geometry remains individually disposable", () => {
  const cache = createGeometryCache(1);
  cache.get("first", () => new BoxGeometry());
  const overflow = cache.get("second", () => new BoxGeometry());
  assert.equal(cache.size, 1);
  assert.equal(overflow.userData.roomtoneShared, undefined);
  cache.dispose(); overflow.dispose();
});
test("furniture batching preserves transformed geometry, UVs and material identity", () => {
  const root = new Group(), nested = new Group(), cache = createGeometryCache();
  root.position.set(3, 0, 7); nested.position.set(1, 2, 3); nested.rotation.y = Math.PI / 4; root.add(nested);
  const geometry = cache.get("box", () => new BoxGeometry(1, 2, 3)), material = new MeshStandardMaterial();
  for (let i = 0; i < 4; i++) { const mesh = new Mesh(geometry, material); mesh.position.x = i * 2; mesh.castShadow = true; nested.add(mesh); }
  root.updateMatrixWorld(true);
  const before = new Box3().setFromObject(root).getSize(new Vector3());
  assert.equal(batchPrimitives(root), 3);
  const merged = root.children.find((child) => child.isMesh);
  const after = new Box3().setFromObject(root).getSize(new Vector3());
  assert.ok(before.distanceTo(after) < 0.00001);
  assert.equal(merged.material, material);
  assert.equal(merged.castShadow, true);
  assert.equal(merged.geometry.index.count, geometry.index.count * 4);
  assert.equal(merged.geometry.attributes.uv.count, geometry.attributes.uv.count * 4);
  assert.equal(merged.geometry.userData.roomtoneShared, undefined);
  assert.equal(geometry.userData.roomtoneShared, true);
  merged.geometry.dispose(); material.dispose(); cache.dispose();
});
test("batching never changes transparency ordering, hidden meshes, or picking metadata", () => {
  const root = new Group(), cache = createGeometryCache(), geometry = cache.get("box", () => new BoxGeometry());
  const transparent = new MeshStandardMaterial({ transparent: true, opacity: 0.3 });
  const opaque = new MeshStandardMaterial();
  for (const material of [transparent, transparent, opaque, opaque]) root.add(new Mesh(geometry, material));
  root.children[2].userData.role = "keep";
  root.children[3].visible = false;
  assert.equal(batchPrimitives(root), 0);
  assert.equal(root.children.length, 4);
  cache.dispose(); transparent.dispose(); opaque.dispose();
});
test("native wind and water run only when an animated mesh is visible", () => {
  const root = new Group(), hidden = new Group(), material = new MeshStandardMaterial(), geometry = new BoxGeometry();
  material.userData.roomtoneAnimated = true;
  hidden.add(new Mesh(geometry, material)); root.add(hidden);
  assert.equal(visibleAnimation(root), true);
  hidden.visible = false;
  assert.equal(visibleAnimation(root), false);
  hidden.visible = true; root.visible = false;
  assert.equal(visibleAnimation(root), false);
  material.dispose(); geometry.dispose();
});
