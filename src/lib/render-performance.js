import { Matrix4, Mesh } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function createGeometryCache(limit = 1500) {
  const entries = new Map();
  let hits = 0;
  return {
    get(key, build) {
      if (entries.has(key)) { hits++; return entries.get(key); }
      const geometry = build();
      if (entries.size < limit) {
        geometry.userData.roomtoneShared = true;
        entries.set(key, geometry);
      }
      return geometry;
    },
    get size() { return entries.size; },
    get hits() { return hits; },
    dispose() { for (const geometry of entries.values()) geometry.dispose(); entries.clear(); },
  };
}

export function batchPrimitives(root) {
  root.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert(), groups = new Map();
  root.traverse((mesh) => {
    const material = mesh.material;
    if (!mesh.isMesh || !mesh.geometry.userData.roomtoneShared || Array.isArray(material) || material.transparent || Object.keys(mesh.userData).length) return;
    for (let parent = mesh; parent && parent !== root; parent = parent.parent) if (!parent.visible) return;
    const key = [material.uuid, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask, !!mesh.geometry.index, Object.keys(mesh.geometry.attributes).sort().join(",")].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  });
  let removed = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const transformed = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      geometry.clearGroups();
      return geometry;
    });
    const geometry = mergeGeometries(transformed);
    for (const scratch of transformed) scratch.dispose();
    if (!geometry) continue;
    delete geometry.userData.roomtoneShared;
    const first = meshes[0], merged = new Mesh(geometry, first.material);
    merged.castShadow = first.castShadow; merged.receiveShadow = first.receiveShadow;
    merged.renderOrder = first.renderOrder; merged.layers.mask = first.layers.mask;
    for (const mesh of meshes) mesh.removeFromParent();
    root.add(merged);
    removed += meshes.length - 1;
  }
  return removed;
}

export function visibleAnimation(root) {
  if (!root.visible) return false;
  if (root.isMesh && (Array.isArray(root.material) ? root.material : [root.material]).some((material) => material.userData.roomtoneAnimated)) return true;
  return root.children.some(visibleAnimation);
}
