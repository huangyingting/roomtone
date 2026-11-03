import * as THREE from "three";
import { CATALOG_BY_ID, FINISHES, type CatalogItem } from "./catalog";
import { LOT, type Home, type Opening, type Piece, type Room, type ViewSettings } from "./model";

type Pattern = (typeof FINISHES)[number]["pattern"] | "grass" | "fabric" | "gravel";
type SurfaceOptions = {
  roughness?: number; metalness?: number; opacity?: number; emissive?: string;
  emission?: number; pattern?: Pattern; repeatX?: number; repeatY?: number;
};

/** Resources are owned by one canvas, shared across rebuilds, and released at unmount. */
export class MeshResources {
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private textures = new Map<string, THREE.CanvasTexture>();
  private canvases = new Map<string, HTMLCanvasElement>();

  geometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = make();
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  private texture(pattern: Pattern, color: string, repeatX: number, repeatY: number) {
    const imageKey = `${pattern}:${color}`;
    let canvas = this.canvases.get(imageKey);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("A 2D canvas is required to create the procedural finishes.");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 256, 256);
      let seed = 173;
      for (const char of imageKey) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      if (pattern === "timber") {
        for (let row = 0; row < 8; row++) {
          const y = row * 32;
          ctx.fillStyle = `rgba(70,43,22,${0.025 + random() * 0.045})`;
          ctx.fillRect(0, y, 256, 31);
          ctx.fillStyle = "rgba(71,48,25,.16)";
          ctx.fillRect(0, y, 256, 1);
          const joint = (row % 3) * 79 + 16;
          ctx.fillRect(joint, y, 1, 32);
          for (let grain = 0; grain < 9; grain++) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(83,54,29,${random() * 0.075})`;
            const gy = y + 2 + random() * 27;
            ctx.moveTo(0, gy);
            ctx.bezierCurveTo(70, gy + random() * 3, 170, gy - random() * 3, 256, gy);
            ctx.stroke();
          }
        }
      } else if (pattern === "tile" || pattern === "brick") {
        const brick = pattern === "brick";
        const height = brick ? 32 : 64;
        const width = brick ? 96 : 64;
        for (let row = 0; row < 256 / height; row++) {
          for (let col = -1; col < 256 / width + 1; col++) {
            const x = col * width + (brick && row % 2 ? width / 2 : 0);
            ctx.fillStyle = `rgba(255,250,227,${random() * 0.11})`;
            ctx.fillRect(x + 2, row * height + 2, width - 4, height - 4);
            ctx.strokeStyle = brick ? "rgba(231,218,193,.55)" : "rgba(115,104,83,.16)";
            ctx.lineWidth = brick ? 3 : 1.5;
            ctx.strokeRect(x, row * height, width, height);
          }
        }
      } else if (pattern === "wallpaper" || pattern === "fabric") {
        ctx.strokeStyle = "rgba(255,252,234,.18)";
        for (let x = 0; x < 256; x += 4) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(256, x); ctx.stroke();
        }
        if (pattern === "wallpaper") {
          ctx.fillStyle = "rgba(122,110,82,.09)";
          for (let x = 16; x < 256; x += 32) {
            for (let y = 16; y < 256; y += 32) {
              ctx.beginPath(); ctx.ellipse(x, y, 2, 5, Math.PI / 4, 0, Math.PI * 2); ctx.fill();
            }
          }
        }
      }
      const dots = pattern === "grass" ? 3600 : pattern === "gravel" ? 1800 : 650;
      for (let i = 0; i < dots; i++) {
        ctx.fillStyle = random() > 0.5 ? "rgba(255,248,218,.09)" : "rgba(49,46,25,.07)";
        const size = pattern === "gravel" ? 1 + random() * 3 : 1;
        ctx.fillRect(random() * 256, random() * 256, size, size);
      }
      this.canvases.set(imageKey, canvas);
    }
    const key = `${imageKey}:${repeatX}:${repeatY}`;
    let texture = this.textures.get(key);
    if (!texture) {
      texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      this.textures.set(key, texture);
    }
    return texture;
  }

  material(color: string, options: SurfaceOptions = {}): THREE.MeshStandardMaterial {
    const key = `${color}:${JSON.stringify(options)}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: options.pattern ? "#ffffff" : color,
        roughness: options.roughness ?? 0.82,
        metalness: options.metalness ?? 0,
        transparent: (options.opacity ?? 1) < 1,
        opacity: options.opacity ?? 1,
        depthWrite: (options.opacity ?? 1) >= 1,
        emissive: options.emissive ?? "#000000",
        emissiveIntensity: options.emission ?? 0,
        map: options.pattern ? this.texture(options.pattern, color, options.repeatX ?? 1, options.repeatY ?? 1) : null,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  finish(index: number, width: number, height: number): THREE.MeshStandardMaterial {
    const finish = FINISHES[index];
    if (!finish) throw new Error(`Unknown finish: ${index}`);
    return this.material(finish.color, {
      pattern: finish.pattern, repeatX: width / 2, repeatY: height / 2,
    });
  }

  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.geometries.clear(); this.materials.clear(); this.textures.clear(); this.canvases.clear();
  }
}

function shade(color: string, amount: number) {
  return `#${new THREE.Color(color).lerp(new THREE.Color(amount < 0 ? "#292c23" : "#fff8e8"), Math.abs(amount)).getHexString()}`;
}

class Primitives {
  constructor(private resources: MeshResources, private group: THREE.Group) {}

  box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material | THREE.Material[]) {
    const box = this.resources.geometry("box", () => new THREE.BoxGeometry(1, 1, 1));
    let geometry = box;
    if (Array.isArray(material)) {
      const unique = [...new Set(material)];
      const slots = material.map((entry) => unique.indexOf(entry));
      if (unique.length === 1) material = unique[0];
      else {
        // Combine disconnected faces with the same material into one draw, retaining their original UVs.
        geometry = this.resources.geometry(`box-groups:${slots.join(",")}`, () => {
          const merged = box.clone();
          const index = box.getIndex();
          if (!index) throw new Error("The shared box geometry must be indexed.");
          const ordered: number[] = [];
          merged.clearGroups();
          for (let slot = 0; slot < unique.length; slot++) {
            const start = ordered.length;
            for (const face of box.groups) {
              if (slots[face.materialIndex ?? 0] !== slot) continue;
              for (let i = face.start; i < face.start + face.count; i++) ordered.push(index.getX(i));
            }
            merged.addGroup(start, ordered.length - start, slot);
          }
          merged.setIndex(ordered);
          return merged;
        });
        material = unique;
      }
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  cylinder(top: number, bottom: number, h: number, x: number, y: number, z: number, material: THREE.Material, sides = 12) {
    const ratio = bottom ? top / bottom : 0;
    const geometry = this.resources.geometry(`cylinder:${ratio.toFixed(5)}:${sides}`, () => new THREE.CylinderGeometry(ratio, 1, 1, sides));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(bottom, h, bottom);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  ellipsoid(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, faceted = false) {
    const geometry = this.resources.geometry(faceted ? "ico" : "sphere", () => faceted ? new THREE.IcosahedronGeometry(1, 1) : new THREE.SphereGeometry(1, 12, 8));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(w / 2, h / 2, d / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  rod(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) {
    const midpoint = from.clone().add(to).multiplyScalar(0.5);
    const mesh = this.cylinder(radius, radius, from.distanceTo(to), midpoint.x, midpoint.y, midpoint.z, material, 8);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    return mesh;
  }
}

export function nightAmount(time: number) {
  const daylight = Math.sin(((time - 6) / 24) * Math.PI * 2);
  return 1 - THREE.MathUtils.smoothstep(daylight, -0.08, 0.4);
}

/** All catalog silhouettes are built from original, reusable geometric primitives. */
export function createPieceMesh(piece: Piece, resources: MeshResources, night = 0): THREE.Group {
  const item = CATALOG_BY_ID.get(piece.catalogId);
  if (!item) throw new Error(`Unknown furniture: ${piece.catalogId}`);
  const group = furniture(item, piece.color, resources, night);
  group.name = item.name;
  group.userData.entityId = piece.id;
  group.position.set(piece.x, piece.floor * 3 + (item.category === "Garden" ? 0 : 0.08), piece.z);
  group.rotation.y = THREE.MathUtils.degToRad(piece.rotation);
  if (item.shape === "counter") group.scale.set(piece.scale, 1, 1);
  else group.scale.setScalar(piece.scale);
  return group;
}

function furniture(item: CatalogItem, color: string, resources: MeshResources, night: number): THREE.Group {
  const group = new THREE.Group();
  const p = new Primitives(resources, group);
  const { width: w, depth: d, height: h, id } = item;
  const main = resources.material(color);
  const dark = resources.material(shade(color, -0.22));
  const light = resources.material(shade(color, 0.22));
  const oak = resources.material("#b19670");
  const walnut = resources.material("#71563f");
  const metal = resources.material("#50554f", { metalness: 0.55, roughness: 0.4 });
  const porcelain = resources.material("#f1eee5", { roughness: 0.24 });
  const glass = resources.material("#98babb", { opacity: 0.48, roughness: 0.13, metalness: 0.25 });
  const fabric = resources.material(color, { pattern: "fabric" });
  const legs = (height: number, inset = 0.1, material: THREE.Material = walnut) => {
    for (const x of [-1, 1]) for (const z of [-1, 1]) p.box(0.055, height, 0.055, x * (w / 2 - inset), height / 2, z * (d / 2 - inset), material);
  };
  switch (item.shape) {
    case "sofa": {
      const bench = id === "outdoor-bench";
      legs(h * 0.3);
      p.box(w * 0.94, h * 0.2, d * 0.92, 0, h * 0.33, 0, bench ? walnut : dark);
      p.box(w, h * 0.5, d * 0.15, 0, h * 0.75, -d * 0.41, bench ? oak : fabric);
      if (bench) {
        for (let i = 0; i < 4; i++) p.box(w * 0.96, 0.04, d * 0.15, 0, h * 0.46, -d * 0.3 + i * d * 0.2, main);
      } else {
        const count = w > 2.5 ? 3 : 2;
        const cushionWidth = (w - 0.32) / count;
        for (let i = 0; i < count; i++) {
          const x = -w / 2 + 0.16 + cushionWidth * (i + 0.5);
          p.box(cushionWidth - 0.035, h * 0.21, d * 0.72, x, h * 0.48, d * 0.065, fabric);
          const cushion = p.box(cushionWidth - 0.04, h * 0.36, d * 0.13, x, h * 0.75, -d * 0.29, light);
          cushion.rotation.x = -0.1;
        }
        for (const x of [-1, 1]) {
          p.box(0.15, h * 0.6, d, x * (w / 2 - 0.075), h * 0.6, 0, fabric);
          const pillow = p.box(0.31, 0.29, 0.13, x * (w * 0.32), h * 0.7, -d * 0.18, resources.material("#b99b73", { pattern: "fabric" }));
          pillow.rotation.z = x * 0.22;
        }
        if (id === "corner-sofa") p.box(w * 0.3, h * 0.24, d * 0.65, w * 0.29, h * 0.48, d * 0.19, fabric);
      }
      break;
    }
    case "chair": {
      const stool = id === "bar-stool";
      const lounge = id === "lounge-chair";
      legs(h * (stool ? 0.65 : 0.46), Math.min(w, d) * 0.16, lounge ? walnut : main);
      p.box(w * 0.92, h * 0.12, d * 0.9, 0, h * (stool ? 0.69 : 0.48), 0, fabric);
      const back = p.box(w * 0.9, h * (stool ? 0.26 : 0.49), d * 0.12, 0, h * (stool ? 0.86 : 0.76), -d * 0.41, lounge ? light : main);
      back.rotation.x = -0.12;
      if (lounge) for (const x of [-1, 1]) p.box(w * 0.12, h * 0.27, d * 0.86, x * w * 0.44, h * 0.63, 0, fabric);
      if (stool) p.box(w * 0.8, 0.035, 0.035, 0, h * 0.25, d * 0.32, metal);
      break;
    }
    case "table": {
      if (id === "olive-ottoman") {
        legs(0.09);
        p.cylinder(w * 0.48, w * 0.46, h * 0.83, 0, h * 0.54, 0, fabric, 20);
        p.cylinder(w * 0.485, w * 0.485, 0.025, 0, h * 0.96, 0, light, 20);
      } else {
        const round = id.includes("round") || id === "patio-table" || id === "side-table";
        if (round) {
          p.cylinder(w / 2, w / 2, 0.065, 0, h - 0.033, 0, main, 24).scale.z *= d / w;
          p.cylinder(0.07, 0.12, h - 0.08, 0, (h - 0.08) / 2, 0, oak);
          p.cylinder(w * 0.24, w * 0.3, 0.04, 0, 0.035, 0, dark, 16);
        } else {
          legs(h - 0.07, 0.12, id === "workbench" ? metal : oak);
          p.box(w, 0.07, d, 0, h - 0.035, 0, main);
          p.box(w * 0.85, 0.14, 0.06, 0, h - 0.14, -d * 0.32, dark);
        }
        if (id.includes("coffee")) {
          p.box(0.24, 0.025, 0.17, -w * 0.16, h + 0.012, 0, resources.material("#a46f55"));
          p.cylinder(0.045, 0.04, 0.06, w * 0.19, h + 0.03, 0, porcelain);
        }
        if (id === "desk") {
          p.box(0.36, 0.025, 0.25, 0, h + 0.014, -0.06, metal);
          p.box(0.36, 0.24, 0.025, 0, h + 0.13, -0.18, resources.material("#344d51"));
        }
      }
      break;
    }
    case "bed": {
      const lounger = id === "sun-lounger";
      legs(h * 0.28, 0.11);
      p.box(w, h * 0.28, d, 0, h * 0.32, 0, oak);
      p.box(w * 0.95, h * 0.31, d * 0.97, 0, h * 0.61, 0, porcelain);
      p.box(w * 0.96, h * 0.16, d * 0.64, 0, h * 0.85, d * 0.16, fabric);
      const headboard = p.box(w, h * (lounger ? 0.55 : 0.95), 0.09, 0, h * 0.63, -d / 2 + 0.025, lounger ? fabric : dark);
      if (lounger) headboard.rotation.x = -0.35;
      const pillows = w > 1.2 ? 2 : 1;
      for (let i = 0; i < pillows; i++) {
        const pillow = p.box(w * 0.78 / pillows, h * 0.16, d * 0.19, (i - (pillows - 1) / 2) * w * 0.46, h * 0.85, -d * 0.31, resources.material("#f6f0e3", { pattern: "fabric" }));
        pillow.rotation.y = (i % 2 ? 1 : -1) * 0.04;
      }
      p.box(w * 0.975, 0.025, d * 0.16, 0, h * 0.95, d * 0.29, light);
      break;
    }
    case "cabinet":
    case "counter": {
      const counter = item.shape === "counter";
      const base = 0.07;
      p.box(w * 0.93, base, d * 0.91, 0, base / 2, 0, dark);
      p.box(w, h - base - 0.055, d, 0, (h + base - 0.055) / 2, 0, main);
      p.box(w + 0.035, 0.055, d + 0.035, 0, h - 0.027, 0, counter ? resources.material("#ebe5d5", { pattern: "tile", repeatX: w / 2, repeatY: d / 2 }) : light);
      const doors = Math.max(1, Math.round(w / 0.55));
      for (let i = 0; i < doors; i++) {
        const x = -w / 2 + (i + 0.5) * w / doors;
        p.box(w / doors - 0.025, h - base - 0.11, 0.025, x, h / 2 + 0.01, d / 2 + 0.009, light);
        p.box(0.09, 0.018, 0.035, x + w / doors * 0.2, h * 0.7, d / 2 + 0.035, metal);
        if (id === "dresser" || id.includes("nightstand") || id === "tool-cabinet") {
          for (let j = 1; j <= 2; j++) p.box(w / doors - 0.035, 0.009, 0.029, x, h * j / 3, d / 2 + 0.027, dark);
        }
      }
      if (id === "media-console") {
        p.box(w * 0.67, h * 0.94, 0.055, 0, h * 1.61, -d * 0.15, metal);
        p.box(w * 0.63, h * 0.83, 0.013, 0, h * 1.61, -d * 0.15 + 0.035, resources.material("#354748", { roughness: 0.25 }));
        p.box(w * 0.32, 0.03, 0.17, 0, h + 0.018, -d * 0.15, metal);
        p.box(0.045, 0.12, 0.05, 0, h + 0.07, -d * 0.15, metal);
      }
      break;
    }
    case "shelf": {
      const wall = id === "wall-shelves";
      const rack = id === "storage-rack";
      const frame = rack ? metal : main;
      if (!wall) {
        for (const x of [-1, 1]) p.box(0.055, h, d, x * (w / 2 - 0.027), h / 2, 0, frame);
        if (!rack) p.box(w, h, 0.025, 0, h / 2, -d / 2 + 0.012, dark);
      }
      const count = wall ? 3 : 5;
      const colors = ["#998f6a", "#b6795d", "#708a80", "#d5bc87", "#6e7877", "#dbcbb0"];
      for (let row = 0; row < count; row++) {
        const y = wall ? 0.65 + row * (h - 0.7) / 2 : 0.07 + row * (h - 0.09) / (count - 1);
        p.box(w, 0.045, d, 0, y, 0, frame);
        if (row === count - 1 && !wall) continue;
        const books = Math.max(3, Math.floor(w / 0.105));
        for (let i = 0; i < books; i++) {
          const bookHeight = Math.min(0.27, h / count * 0.72) * (0.8 + ((i * 7 + row * 3) % 5) * 0.04);
          const x = -w * 0.43 + i * w * 0.82 / books;
          if (id === "towel-cabinet") {
            if (i % 3 === 0) p.box(w * 0.24, 0.085, d * 0.82, x + w * 0.06, y + 0.07, 0, i % 2 ? light : porcelain);
          } else {
            const book = p.box(w * 0.68 / books, bookHeight, d * 0.74, x, y + 0.025 + bookHeight / 2, 0.015, resources.material(colors[(i + row) % colors.length]));
            if (i === 1) book.rotation.z = -0.12;
          }
        }
      }
      break;
    }
    case "lamp": {
      const pendant = id === "pendant-light";
      const lantern = id === "garden-lantern";
      const glow = resources.material("#f7deb0", { emissive: "#ffc77e", emission: 0.25 + night * 2, roughness: 0.6 });
      if (lantern) {
        p.box(w, 0.055, d, 0, 0.028, 0, metal);
        p.box(w * 0.68, h * 0.58, d * 0.68, 0, h * 0.43, 0, glow);
        for (const x of [-1, 1]) for (const z of [-1, 1]) p.box(0.025, h * 0.62, 0.025, x * w * 0.38, h * 0.44, z * d * 0.38, metal);
        p.cylinder(0, w * 0.7, h * 0.23, 0, h * 0.87, 0, metal, 4).rotation.y = Math.PI / 4;
      } else {
        if (!pendant) p.cylinder(w * 0.38, w * 0.44, 0.04, 0, 0.025, 0, dark, 20);
        p.cylinder(0.015, 0.015, pendant ? 0.55 : h * 0.73, 0, pendant ? h - 0.275 : h * 0.38, 0, metal, 8);
        p.cylinder(w * 0.31, w * 0.49, h * (pendant ? 0.13 : 0.23), 0, pendant ? h - 0.56 : h * 0.86, 0, pendant ? main : light, 20);
        p.cylinder(w * 0.44, w * 0.44, 0.015, 0, pendant ? h - 0.7 : h * 0.74, 0, glow, 20);
      }
      break;
    }
    case "plant":
    case "tree":
    case "hedge": {
      const tree = item.shape === "tree";
      const hedge = item.shape === "hedge";
      const leaf = resources.material(tree || hedge ? color : "#668250", { roughness: 1 });
      const leafLight = resources.material(shade(tree || hedge ? color : "#668250", 0.12), { roughness: 1 });
      if (hedge) {
        p.box(w * 0.98, h * 0.78, d * 0.82, 0, h * 0.48, 0, leaf);
        for (let i = 0; i < 8; i++) p.ellipsoid(w * 0.26, h * 0.48, d, -w * 0.44 + i * w * 0.88 / 7, h * 0.73, 0, i % 2 ? leaf : leafLight, true);
      } else if (tree) {
        p.cylinder(0.06, 0.12, h * 0.67, 0, h * 0.335, 0, walnut, 7);
        if (id === "cypress") {
          for (let i = 0; i < 4; i++) p.cylinder(i === 3 ? 0 : w * (0.32 - i * 0.06), w * (0.5 - i * 0.09), h * 0.4, 0, h * (0.43 + i * 0.12), 0, i % 2 ? leaf : leafLight, 7);
        } else {
          for (let i = 0; i < 7; i++) {
            const angle = i * 2.4;
            const radius = i === 6 ? 0 : w * 0.26;
            const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
            const y = h * (0.7 + (i % 3) * 0.07);
            p.rod(new THREE.Vector3(0, h * 0.43, 0), new THREE.Vector3(x, y, z), 0.035, walnut);
            p.ellipsoid(w * 0.66, h * 0.32, d * 0.66, x, y, z, i % 2 ? leaf : leafLight, true);
          }
        }
      } else {
        const pot = resources.material(id === "terracotta-pot" ? color : "#bd9174");
        p.cylinder(w * 0.34, w * 0.24, h * 0.3, 0, h * 0.15, 0, pot, 14);
        p.cylinder(w * 0.37, w * 0.37, 0.045, 0, h * 0.3, 0, pot, 14);
        p.cylinder(w * 0.32, w * 0.32, 0.01, 0, h * 0.315, 0, walnut);
        p.cylinder(0.015, 0.023, h * 0.42, 0, h * 0.5, 0, walnut, 7);
        for (let i = 0; i < 9; i++) {
          const angle = i * 2.4;
          const length = h * (0.35 + (i % 3) * 0.04);
          const mesh = p.ellipsoid(w * 0.17, length, w * 0.065, Math.cos(angle) * w * 0.22, h * (0.68 + (i % 3) * 0.07), Math.sin(angle) * d * 0.22, i % 2 ? leaf : leafLight);
          mesh.rotation.set(Math.sin(angle) * 0.65, angle, -Math.cos(angle) * 0.65);
        }
      }
      break;
    }
    case "rug": {
      const mesh = p.box(w, h, d, 0, h / 2 + 0.005, 0, fabric);
      mesh.castShadow = false;
      for (const z of [-1, 1]) p.box(w * 0.94, 0.003, d * 0.03, 0, h + 0.008, z * d * 0.45, light).castShadow = false;
      for (const x of [-1, 1]) p.box(w * 0.018, 0.003, d * 0.88, x * w * 0.46, h + 0.008, 0, dark).castShadow = false;
      break;
    }
    case "appliance": {
      p.box(w, h, d, 0, h / 2, 0, main);
      if (id === "refrigerator") {
        for (const [y, height] of [[h * 0.65, h * 0.65], [h * 0.16, h * 0.3]]) {
          p.box(w * 0.94, height, 0.035, 0, y, d / 2 + 0.013, light);
          p.box(0.025, height * 0.4, 0.04, w * 0.34, y, d / 2 + 0.047, metal);
        }
      } else {
        const black = resources.material("#333d3b", { roughness: 0.26 });
        p.box(w * 0.85, h * 0.52, 0.025, 0, h * 0.4, d / 2 + 0.015, black);
        p.box(w * 0.75, 0.025, 0.04, 0, h * 0.71, d / 2 + 0.05, metal);
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
          p.cylinder(0.1, 0.1, 0.012, x * w * 0.25, h + 0.007, z * d * 0.25, black, 16);
          p.cylinder(0.045, 0.045, 0.016, x * w * 0.25, h + 0.016, z * d * 0.25, metal);
        }
        for (let i = 0; i < 4; i++) p.ellipsoid(0.04, 0.04, 0.024, -w * 0.3 + i * w * 0.2, h * 0.88, d / 2 + 0.025, metal);
      }
      break;
    }
    case "sink": {
      p.box(w, h * 0.88, d, 0, h * 0.44, 0, main);
      const rim = 0.1;
      p.box(w, 0.06, d * 0.2, 0, h - 0.03, -d * 0.4, porcelain);
      p.box(w, 0.06, d * 0.2, 0, h - 0.03, d * 0.4, porcelain);
      for (const x of [-1, 1]) p.box(w * rim, 0.06, d * 0.6, x * w * (0.5 - rim / 2), h - 0.03, 0, porcelain);
      p.box(w * 0.8, 0.025, d * 0.62, 0, h - 0.065, 0, resources.material("#aabdb9", { metalness: 0.15, roughness: 0.3 }));
      p.cylinder(0.015, 0.015, 0.18, 0, h + 0.06, -d * 0.34, metal, 8);
      p.box(0.025, 0.025, d * 0.22, 0, h + 0.14, -d * 0.24, metal);
      for (const x of [-1, 1]) p.box(w * 0.47, h * 0.72, 0.015, x * w * 0.25, h * 0.43, d / 2 + 0.01, light);
      if (id === "bath-vanity") {
        p.box(w * 0.75, 0.6, 0.035, 0, h + 0.55, -d / 2 + 0.015, oak);
        p.box(w * 0.7, 0.55, 0.01, 0, h + 0.55, -d / 2 + 0.04, resources.material("#a6bfba", { metalness: 0.8, roughness: 0.15 }));
      }
      break;
    }
    case "toilet":
      p.ellipsoid(w * 0.68, h * 0.48, d * 0.55, 0, h * 0.24, d * 0.1, porcelain);
      p.ellipsoid(w, h * 0.32, d * 0.68, 0, h * 0.48, d * 0.14, porcelain);
      p.ellipsoid(w * 0.65, 0.014, d * 0.43, 0, h * 0.648, d * 0.15, resources.material("#a8b6ad", { roughness: 0.2 }));
      p.box(w * 0.88, h * 0.47, d * 0.22, 0, h * 0.72, -d * 0.35, porcelain);
      p.box(w * 0.9, 0.035, d * 0.25, 0, h * 0.97, -d * 0.35, light);
      p.cylinder(0.026, 0.026, 0.01, 0, h + 0.005, -d * 0.35, metal);
      break;
    case "tub": {
      // A sunken basin with four curved rim sections, rather than a solid oval.
      p.ellipsoid(w * 0.91, h * 0.42, d * 0.91, 0, h * 0.27, 0, porcelain);
      for (const x of [-1, 1]) p.ellipsoid(w * 0.18, h * 0.72, d * 0.97, x * w * 0.4, h * 0.61, 0, porcelain);
      for (const z of [-1, 1]) p.ellipsoid(w * 0.95, h * 0.72, d * 0.14, 0, h * 0.61, z * d * 0.43, porcelain);
      p.ellipsoid(w * 0.71, 0.035, d * 0.76, 0, h * 0.48, 0, resources.material("#99babc", { roughness: 0.18, metalness: 0.12 }));
      p.cylinder(0.017, 0.017, h * 0.96, w * 0.4, h * 0.48, -d * 0.28, metal, 8);
      p.box(w * 0.23, 0.025, 0.025, w * 0.31, h * 0.98, -d * 0.28, metal);
      break;
    }
    case "car": {
      const tyre = resources.material("#343934", { roughness: 0.98 });
      p.box(w * 0.85, h * 0.12, d * 0.91, 0, h * 0.25, 0, metal);
      p.box(w * 0.97, h * 0.35, d * 0.97, 0, h * 0.43, 0, main);
      p.box(w * 0.77, h * 0.36, d * 0.47, 0, h * 0.79, -d * 0.04, main);
      const windshield = p.box(w * 0.71, h * 0.3, 0.035, 0, h * 0.79, d * 0.2, resources.material("#719299", { metalness: 0.35, roughness: 0.19 }));
      windshield.rotation.x = -0.23;
      p.box(w * 0.7, h * 0.25, 0.03, 0, h * 0.8, -d * 0.285, glass);
      for (const x of [-1, 1]) {
        for (const z of [-1, 1]) {
          const wheel = p.cylinder(h * 0.205, h * 0.205, w * 0.12, x * w * 0.47, h * 0.205, z * d * 0.31, tyre, 16);
          wheel.rotation.z = Math.PI / 2;
          const hub = p.cylinder(h * 0.115, h * 0.115, w * 0.125, x * w * 0.475, h * 0.205, z * d * 0.31, resources.material("#b2b8af", { metalness: 0.7 }), 12);
          hub.rotation.z = Math.PI / 2;
        }
        p.box(0.025, h * 0.27, d * 0.39, x * w * 0.393, h * 0.8, -d * 0.035, glass);
        p.box(0.04, h * 0.33, 0.055, x * w * 0.403, h * 0.8, -d * 0.04, main);
        p.box(w * 0.16, h * 0.09, 0.025, x * w * 0.3, h * 0.49, d * 0.493, resources.material("#f3deb0", { emissive: "#ffe1a2", emission: night * 1.4 }));
        p.box(w * 0.16, h * 0.07, 0.025, x * w * 0.3, h * 0.48, -d * 0.493, resources.material("#a96950"));
      }
      p.box(w * 0.85, 0.045, 0.07, 0, h * 0.3, d * 0.48, metal);
      break;
    }
    case "pool": {
      const shower = id === "shower-tray";
      const rim = shower ? 0.06 : 0.16;
      const stone = resources.material("#e3decc", { pattern: "tile", repeatX: w / 2, repeatY: d / 2 });
      p.box(w, h * 0.55, d, 0, h * 0.275, 0, dark);
      for (const x of [-1, 1]) p.box(rim, h, d, x * (w / 2 - rim / 2), h / 2, 0, stone);
      for (const z of [-1, 1]) p.box(w - rim * 2, h, rim, 0, h / 2, z * (d / 2 - rim / 2), stone);
      const water = p.box(w - rim * 2, 0.014, d - rim * 2, 0, h * 0.78, 0, resources.material(color, { roughness: 0.14, metalness: 0.15, emissive: "#397d82", emission: night * 0.25, pattern: "tile", repeatX: w / 2, repeatY: d / 2 }));
      water.castShadow = false;
      if (!shower) {
        for (const x of [-1, 1]) {
          p.rod(new THREE.Vector3(x * 0.19, h, d * 0.32), new THREE.Vector3(x * 0.19, h + 0.38, d * 0.32), 0.025, metal);
          p.rod(new THREE.Vector3(x * 0.19, h + 0.38, d * 0.32), new THREE.Vector3(x * 0.19, h + 0.38, d * 0.45), 0.025, metal);
        }
        p.box(0.42, 0.025, 0.04, 0, h + 0.14, d * 0.32, metal);
      } else {
        for (const x of [-1, 1]) p.box(0.025, 1.85, d, x * (w / 2 - 0.012), 0.925 + h, 0, glass).castShadow = false;
        p.cylinder(0.018, 0.018, 1.55, 0, 0.775 + h, -d * 0.43, metal, 8);
        p.box(0.16, 0.025, 0.16, 0, 1.64 + h, -d * 0.3, metal);
      }
      break;
    }
    case "deck": {
      const pattern = id === "timber-deck" ? "timber" : id === "stone-paving" ? "tile" : "gravel";
      p.box(w, h, d, 0, h / 2, 0, resources.material(color, { pattern, repeatX: w / 2, repeatY: d / 2 })).castShadow = false;
      if (id === "timber-deck") for (const x of [-1, 1]) p.box(0.045, h + 0.012, d, x * (w / 2 - 0.022), h / 2, 0, dark);
      break;
    }
    case "fence":
      for (const x of [-1, 1]) {
        p.box(0.085, h, d, x * (w / 2 - 0.06), h / 2, 0, dark);
        p.box(0.11, 0.04, d + 0.02, x * (w / 2 - 0.06), h, 0, light);
      }
      for (const y of [h * 0.25, h * 0.73]) p.box(w, 0.075, d * 0.5, 0, y, -d * 0.28, dark);
      for (let i = 0; i < 12; i++) p.box(w * 0.056, h * 0.82, d * 0.38, -w * 0.43 + i * w * 0.86 / 11, h * 0.49, d * 0.18, i % 3 ? main : light);
      break;
    case "flowers": {
      p.box(w, h * 0.18, d, 0, h * 0.09, 0, dark);
      if (id === "flower-bed") for (const z of [-1, 1]) p.box(w, h * 0.3, 0.04, 0, h * 0.15, z * (d / 2 - 0.02), main);
      const green = resources.material("#6e8051");
      const petals = ["#e3c27e", "#c68f79", "#d7b6a5", "#c6c9a2"];
      for (let i = 0; i < 24; i++) {
        const x = (((i * 0.6180339) % 1) - 0.5) * w * 0.89;
        const z = (((i * 0.4142135) % 1) - 0.5) * d * 0.83;
        const height = h * (0.55 + (i % 4) * 0.1);
        p.cylinder(0.008, 0.008, height, x, height / 2 + h * 0.1, z, green, 5);
        p.ellipsoid(0.12, 0.09, 0.12, x, height + h * 0.12, z, resources.material(petals[i % 4]), true);
        p.ellipsoid(0.09, 0.035, 0.04, x + 0.035, height * 0.65, z, green);
      }
      break;
    }
    case "stairs": {
      const count = 12;
      for (let i = 0; i < count; i++) {
        const height = (i + 1) * h / count;
        p.box(w, height, d / count, 0, height / 2, d / 2 - (i + 0.5) * d / count, i % 2 ? main : light);
      }
      for (const x of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const z = d / 2 - 0.12 - i * (d - 0.24) / 4;
          const y = (i / 4) * (h - h / count) + h / count;
          p.box(0.025, 0.72, 0.025, x * w * 0.46, y + 0.36, z, metal);
        }
        p.rod(new THREE.Vector3(x * w * 0.46, h / count + 0.72, d / 2 - 0.12), new THREE.Vector3(x * w * 0.46, h + 0.72, -d / 2 + 0.12), 0.026, oak);
      }
      break;
    }
    case "art": {
      const mirror = id === "dressing-mirror";
      p.box(w, h, d * 0.32, 0, h / 2, 0, oak);
      p.box(w * 0.88, h * 0.9, 0.01, 0, h / 2, d * 0.18, mirror ? resources.material(color, { metalness: 0.78, roughness: 0.12 }) : resources.material("#e6dcc5"));
      if (!mirror) {
        p.ellipsoid(w * 0.48, h * 0.39, 0.008, -w * 0.13, h * 0.58, d * 0.205, main);
        p.box(w * 0.59, h * 0.18, 0.01, w * 0.1, h * 0.32, d * 0.21, resources.material("#b58167"));
        p.box(w * 0.04, h * 0.7, 0.013, w * 0.25, h * 0.55, d * 0.22, walnut);
      }
      break;
    }
    default: {
      const exhaustive: never = item.shape;
      throw new Error(`No procedural mesh for ${exhaustive}`);
    }
  }
  return group;
}

export interface BuiltWorld {
  group: THREE.Group;
  entities: Map<string, THREE.Group>;
  dispose: () => void;
}

export function openingWidth(type: Opening["type"]) {
  return type === "garage-door" ? 2.5 : type === "glass-door" ? 1.8 : 1;
}

function buildWall(room: Room, wall: Opening["wall"], openings: Opening[], home: Home, view: ViewSettings, resources: MeshResources) {
  const group = new THREE.Group();
  const p = new Primitives(resources, group);
  const alongX = wall === "north" || wall === "south";
  const length = alongX ? room.width : room.depth;
  const height = view.roof || wall === "north" || wall === "east" ? 2.6 : 0.65;
  const interiorPositive = wall === "north" || wall === "east";
  const interior = resources.finish(room.wallFinish, length, 2.6);
  const exterior = resources.finish(home.exteriorFinish, length, 2.6);
  const cap = resources.material(FINISHES[room.wallFinish].color);
  const materials = [cap, cap, cap, cap, interiorPositive ? interior : exterior, interiorPositive ? exterior : interior];
  const apertures = openings.map((opening) => ({
    opening, from: Math.max(0, opening.offset - openingWidth(opening.type) / 2),
    to: Math.min(length, opening.offset + openingWidth(opening.type) / 2),
    bottom: opening.type === "window" ? 0.85 : 0,
    top: opening.type === "window" ? 2.05 : opening.type === "garage-door" ? 2.3 : 2.2,
  }));
  const breaks = [...new Set([0, length, ...apertures.flatMap((a) => [a.from, a.to])])].sort((a, b) => a - b);
  const segment = (from: number, to: number, bottom: number, top: number) => {
    if (to - from < 0.001 || top - bottom < 0.001) return;
    p.box(to - from, top - bottom, 0.14, (from + to) / 2, 0.08 + (bottom + top) / 2, 0, materials);
    if (bottom === 0) p.box(to - from, 0.075, 0.025, (from + to) / 2, 0.12, interiorPositive ? 0.084 : -0.084, resources.material("#dfd6c5"));
  };
  for (let i = 0; i < breaks.length - 1; i++) {
    const from = breaks[i], to = breaks[i + 1], mid = (from + to) / 2;
    const holes = apertures.filter((a) => mid > a.from && mid < a.to);
    if (!holes.length) segment(from, to, 0, height);
    else {
      // Union vertical holes as well, so imported overlapping apertures never acquire a solid infill.
      let bottom = 0;
      for (const hole of holes.sort((a, b) => a.bottom - b.bottom)) {
        segment(from, to, bottom, Math.min(height, hole.bottom));
        bottom = Math.max(bottom, hole.top);
      }
      segment(from, to, bottom, height);
    }
  }
  const frame = resources.material("#f4eddf");
  const warmGlass = resources.material("#9ebbb8", {
    roughness: 0.12, metalness: 0.18, opacity: 0.5,
    emissive: "#ffd494", emission: nightAmount(view.time) * 1.25,
  });
  for (const aperture of apertures) {
    const { opening, from, to, bottom, top } = aperture;
    if (bottom >= height) continue;
    const openingGroup = new THREE.Group();
    openingGroup.userData.entityId = opening.id;
    const q = new Primitives(resources, openingGroup);
    const visibleTop = Math.min(height, top);
    const visibleHeight = visibleTop - bottom;
    const center = (from + to) / 2;
    for (const x of [from + 0.035, to - 0.035]) q.box(0.07, visibleHeight, 0.19, x, 0.08 + bottom + visibleHeight / 2, 0, frame);
    if (top <= height) q.box(to - from, 0.065, 0.19, center, 0.08 + top - 0.032, 0, frame);
    if (opening.type === "window") {
      q.box(to - from + 0.1, 0.065, 0.25, center, 0.08 + bottom, 0, frame);
      q.box(0.04, visibleHeight, 0.07, center, 0.08 + bottom + visibleHeight / 2, 0, frame);
      const glass = q.box(to - from - 0.11, 0.025, visibleHeight - 0.09, center, 0.08 + bottom + visibleHeight / 2, 0, warmGlass);
      glass.rotation.x = Math.PI / 2;
      glass.castShadow = false;
      q.box(to - from - 0.1, 0.035, 0.06, center, 0.08 + bottom + visibleHeight * 0.46, 0, frame);
    } else if (opening.type === "glass-door") {
      q.box(to - from - 0.12, visibleHeight - 0.055, 0.025, center, 0.08 + visibleHeight / 2, 0, warmGlass).castShadow = false;
      q.box(0.055, visibleHeight, 0.075, center, 0.08 + visibleHeight / 2, 0, frame);
      for (const x of [-1, 1]) q.box(0.023, 0.15, 0.065, center + x * 0.075, 0.08 + Math.min(1, visibleHeight * 0.7), interiorPositive ? 0.05 : -0.05, resources.material("#75654f", { metalness: 0.5 }));
    } else {
      const doorMat = resources.material(opening.type === "garage-door" ? "#b4b6a8" : "#b89570");
      const leaf = q.box(to - from - 0.12, visibleHeight - 0.025, 0.055, center, 0.08 + visibleHeight / 2, 0, doorMat);
      if (opening.type === "door") {
        leaf.rotation.y = interiorPositive ? -0.12 : 0.12;
        for (const y of [visibleHeight * 0.28, visibleHeight * 0.7]) q.box((to - from) * 0.69, visibleHeight * 0.25, 0.012, center, 0.08 + y, interiorPositive ? 0.038 : -0.038, resources.material("#c7aa86"));
        q.ellipsoid(0.055, 0.055, 0.075, to - 0.18, 0.08 + Math.min(1, visibleHeight * 0.65), interiorPositive ? 0.07 : -0.07, resources.material("#8a7959", { metalness: 0.7 }));
      } else {
        for (let y = 0.22; y < visibleHeight; y += 0.25) q.box(to - from - 0.13, 0.012, 0.013, center, 0.08 + y, interiorPositive ? 0.035 : -0.035, resources.material("#8d9487"));
      }
    }
    group.add(openingGroup);
  }
  if (wall === "north") group.position.set(0, 0, 0);
  if (wall === "south") group.position.set(0, 0, room.depth);
  if (wall === "east" || wall === "west") {
    group.rotation.y = -Math.PI / 2;
    group.position.set(wall === "east" ? room.width : 0, 0, 0);
  }
  return group;
}

function roof(room: Room, resources: MeshResources): THREE.Group {
  const group = new THREE.Group();
  const p = new Primitives(resources, group);
  const rotated = room.width > room.depth;
  const w = (rotated ? room.depth : room.width) + 0.38;
  const d = (rotated ? room.width : room.depth) + 0.38;
  const rise = Math.min(1.3, w * 0.25);
  const slope = Math.atan2(rise, w / 2);
  const roofMat = resources.material("#927361", { pattern: "brick", repeatX: w / 2, repeatY: d / 2 });
  for (const side of [-1, 1]) {
    const panel = p.box(Math.hypot(w / 2, rise) + 0.04, 0.11, d, side * w / 4, rise / 2, 0, roofMat);
    panel.rotation.z = -side * slope;
  }
  p.box(0.16, 0.1, d + 0.035, 0, rise + 0.03, 0, resources.material("#806550"));
  const gableGeometry = resources.geometry(`gable:${w}:${rise}`, () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, rise, 0], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    geometry.computeVertexNormals();
    return geometry;
  });
  for (const side of [-1, 1]) {
    const gable = new THREE.Mesh(gableGeometry, resources.material("#d6c9b1"));
    gable.position.z = side * (d / 2 - 0.12);
    if (side < 0) gable.rotation.y = Math.PI;
    gable.castShadow = true;
    group.add(gable);
  }
  group.position.set(room.width / 2, 2.78, room.depth / 2);
  if (rotated) group.rotation.y = Math.PI / 2;
  return group;
}

/** Instances retain per-instance entity IDs, so batching does not compromise picking. */
function batch(source: THREE.Group): THREE.Group {
  source.updateMatrixWorld(true);
  const result = new THREE.Group();
  type Instance = { matrix: THREE.Matrix4; id: string | null };
  type Bucket = { geometry: THREE.BufferGeometry; material: THREE.Material; cast: boolean; receive: boolean; instances: Instance[] };
  const buckets = new Map<string, Bucket>();
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    let ancestor: THREE.Object3D | null = object;
    let entityId: string | null = null;
    while (ancestor) {
      if (typeof ancestor.userData.entityId === "string") { entityId = ancestor.userData.entityId; break; }
      ancestor = ancestor.parent;
    }
    if (Array.isArray(object.material)) {
      const mesh = new THREE.Mesh(object.geometry, object.material);
      mesh.applyMatrix4(object.matrixWorld);
      mesh.castShadow = object.castShadow; mesh.receiveShadow = object.receiveShadow;
      mesh.userData.entityId = entityId;
      result.add(mesh);
      return;
    }
    const key = `${object.geometry.uuid}:${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { geometry: object.geometry, material: object.material, cast: object.castShadow, receive: object.receiveShadow, instances: [] };
      buckets.set(key, bucket);
    }
    bucket.instances.push({ matrix: object.matrixWorld.clone(), id: entityId });
  });
  for (const bucket of buckets.values()) {
    // Transparent instances cannot be depth-sorted independently; keep glass as individual meshes.
    if (bucket.instances.length < 3 || bucket.material.transparent) {
      for (const instance of bucket.instances) {
        const mesh = new THREE.Mesh(bucket.geometry, bucket.material);
        mesh.applyMatrix4(instance.matrix);
        mesh.castShadow = bucket.cast; mesh.receiveShadow = bucket.receive;
        mesh.userData.entityId = instance.id;
        result.add(mesh);
      }
    } else {
      const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.instances.length);
      bucket.instances.forEach((instance, i) => mesh.setMatrixAt(i, instance.matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.entityIds = bucket.instances.map((instance) => instance.id);
      mesh.castShadow = bucket.cast; mesh.receiveShadow = bucket.receive;
      mesh.computeBoundingSphere();
      result.add(mesh);
    }
  }
  result.updateMatrixWorld(true);
  return result;
}

export function buildWorld(home: Home, view: ViewSettings, resources: MeshResources): BuiltWorld {
  const source = new THREE.Group();
  const entities = new Map<string, THREE.Group>();
  const p = new Primitives(resources, source);
  const soil = resources.material("#bbac86");
  p.box(20.25, 0.28, 16.25, 0, -0.35, 0, soil);
  p.box(20, 0.16, 16, 0, -0.08, 0, resources.material("#7b915b", { pattern: "grass", repeatX: 10, repeatY: 8 })).castShadow = false;
  p.box(160, 0.04, 160, 0, -0.52, 0, resources.material("#e7dfd1")).castShadow = false;
  p.box(22, 0.13, 1.3, 0, -0.27, 8.9, resources.material("#d3cfc0", { pattern: "tile", repeatX: 11, repeatY: 0.65 }));
  p.box(22, 0.18, 0.16, 0, -0.28, 9.63, resources.material("#ece6d6"));
  p.box(24, 0.035, 2.2, 0, -0.41, 10.8, resources.material("#c1bfaf", { pattern: "gravel", repeatX: 12, repeatY: 1 }));
  const rooms = home.rooms.filter((room) => room.floor <= view.floor && (!view.focusRoomId || room.id === view.focusRoomId));
  const night = nightAmount(view.time);
  for (const room of rooms) {
    const group = new THREE.Group();
    group.name = room.name; group.userData.entityId = room.id;
    group.position.set(room.x, room.floor * 3, room.z);
    const q = new Primitives(resources, group);
    const edge = resources.material("#ccbea7");
    q.box(room.width, 0.18, room.depth, room.width / 2, -0.01, room.depth / 2, [
      edge, edge, resources.finish(room.floorFinish, room.width, room.depth), edge, edge, edge,
    ]);
    for (const wall of ["north", "south", "east", "west"] as const) {
      const wallGroup = buildWall(room, wall, home.openings.filter((o) => o.roomId === room.id && o.wall === wall), home, view, resources);
      group.add(wallGroup);
      wallGroup.traverse((object) => {
        if (object instanceof THREE.Group && typeof object.userData.entityId === "string") entities.set(object.userData.entityId, object);
      });
    }
    const covered = rooms.some((upper) => upper.floor > room.floor && upper.x < room.x + room.width && upper.x + upper.width > room.x && upper.z < room.z + room.depth && upper.z + upper.depth > room.z);
    if (view.roof && !covered) group.add(roof(room, resources));
    source.add(group); entities.set(room.id, group);
  }
  const focused = home.rooms.find((room) => room.id === view.focusRoomId);
  for (const piece of home.pieces) {
    if (piece.floor > view.floor) continue;
    if (view.focusRoomId && (!focused || piece.floor !== focused.floor || piece.x < focused.x || piece.x > focused.x + focused.width || piece.z < focused.z || piece.z > focused.z + focused.depth)) continue;
    const group = createPieceMesh(piece, resources, night);
    source.add(group); entities.set(piece.id, group);
  }
  const group = batch(source);
  if (view.grid) {
    const geometry = resources.geometry("lot-grid", () => {
      const positions: number[] = [];
      for (let x = LOT.minX; x <= LOT.maxX; x += 0.5) positions.push(x, 0, LOT.minZ, x, 0, LOT.maxZ);
      for (let z = LOT.minZ; z <= LOT.maxZ; z += 0.5) positions.push(LOT.minX, 0, z, LOT.maxX, 0, z);
      const result = new THREE.BufferGeometry();
      result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      return result;
    });
    const material = new THREE.LineBasicMaterial({ color: "#6b795b", transparent: true, opacity: 0.28, depthWrite: false });
    const grid = new THREE.LineSegments(geometry, material);
    grid.position.y = view.floor * 3 + 0.095;
    grid.renderOrder = 1;
    grid.userData.ownedMaterial = true;
    group.add(grid);
  }
  return {
    group, entities,
    dispose: () => {
      group.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (object instanceof THREE.LineSegments && object.userData.ownedMaterial) {
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      });
      group.clear();
      entities.clear();
    },
  };
}

export function hitEntity(intersection: THREE.Intersection): string | null {
  const data = intersection.object.userData;
  if (intersection.instanceId !== undefined && Array.isArray(data.entityIds)) {
    const id: unknown = data.entityIds[intersection.instanceId];
    return typeof id === "string" ? id : null;
  }
  return typeof data.entityId === "string" ? data.entityId : null;
}
