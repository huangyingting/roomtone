import { CATALOG_BY_ID, FINISHES } from "./catalog";

export interface Point { x: number; z: number }
export interface Room extends Point {
  id: string; name: string; width: number; depth: number; floor: 0 | 1;
  floorFinish: number; wallFinish: number;
}
export interface Piece extends Point {
  id: string; catalogId: string; floor: 0 | 1; rotation: number; color: string; scale: number;
}
export type OpeningType = "door" | "window" | "glass-door" | "garage-door";
export const openingWidth = (type: OpeningType) => type === "garage-door" ? 2.5 : type === "glass-door" ? 1.8 : 1;
export interface Opening {
  id: string; roomId: string; wall: "north" | "south" | "east" | "west"; offset: number; type: OpeningType;
}
export interface Home {
  version: 1; name: string; rooms: Room[]; pieces: Piece[]; openings: Opening[]; exteriorFinish: number;
}
export interface ViewSettings {
  floor: 0 | 1; roof: boolean; grid: boolean; time: number; quality: "auto" | "high" | "low"; focusRoomId: string | null;
}
export interface SceneTool {
  kind: "select" | "room" | "place" | "opening" | "paint" | "erase";
  catalogId?: string; rotation: number;
}
export type SceneAction =
  | { type: "select" | "focus" | "erase" | "paint"; id: string | null; point: Point }
  | { type: "place" | "opening"; point: Point }
  | { type: "drawRoom"; point: Point; endPoint: Point }
  | { type: "move"; id: string; point: Point };
export interface SceneProps {
  home: Home; view: ViewSettings; tool: SceneTool; selectedId: string | null;
  onAction: (action: SceneAction) => void; onReady: () => void; onError: (message: string) => void;
}
export const LOT = { minX: -10, maxX: 10, minZ: -8, maxZ: 8 };
export const snap = (value: number) => Math.round(value * 2) / 2;
export const id = () => crypto.randomUUID();
export const clone = <T,>(value: T): T => structuredClone(value);
export function roomAt(home: Home, point: Point, floor: number) {
  return home.rooms.find((room) => room.floor === floor && point.x >= room.x && point.x <= room.x + room.width && point.z >= room.z && point.z <= room.z + room.depth);
}
export function roomError(home: Home, room: Room, exceptId?: string): string | null {
  if (![room.x, room.z, room.width, room.depth].every(Number.isFinite) || room.width < 1 || room.depth < 1) return "Rooms must be at least 1 × 1 m.";
  if (room.x < LOT.minX || room.z < LOT.minZ || room.x + room.width > LOT.maxX || room.z + room.depth > LOT.maxZ) return "Keep the room inside the lot.";
  if (home.rooms.some((r) => r.id !== exceptId && r.floor === room.floor && room.x < r.x + r.width && room.x + room.width > r.x && room.z < r.z + r.depth && room.z + room.depth > r.z)) return "Rooms cannot overlap. Shared walls are welcome.";
  return null;
}
export function pieceError(home: Home, piece: Piece): string | null {
  const entry = CATALOG_BY_ID.get(piece.catalogId);
  if (!entry) return "Unknown furniture piece.";
  const angle = piece.rotation * Math.PI / 180;
  const localWidth = entry.width * piece.scale;
  const localDepth = entry.depth * (entry.shape === "counter" ? 1 : piece.scale);
  const width = Math.abs(Math.cos(angle)) * localWidth + Math.abs(Math.sin(angle)) * localDepth;
  const depth = Math.abs(Math.sin(angle)) * localWidth + Math.abs(Math.cos(angle)) * localDepth;
  if (piece.x - width / 2 < LOT.minX || piece.x + width / 2 > LOT.maxX || piece.z - depth / 2 < LOT.minZ || piece.z + depth / 2 > LOT.maxZ) return "Keep the whole piece inside the lot.";
  if (entry.category !== "Garden" && !home.rooms.some((r) => r.floor === piece.floor && piece.x - width / 2 >= r.x - 0.05 && piece.x + width / 2 <= r.x + r.width + 0.05 && piece.z - depth / 2 >= r.z - 0.05 && piece.z + depth / 2 <= r.z + r.depth + 0.05)) return "This piece needs to fit inside a room on this floor.";
  if (entry.category === "Garden" && piece.floor !== 0) return "Garden pieces belong on the ground floor.";
  return null;
}
export function removeEntity(home: Home, entityId: string): Home {
  const next = clone(home);
  const room = next.rooms.find((r) => r.id === entityId);
  next.rooms = next.rooms.filter((r) => r.id !== entityId);
  next.pieces = next.pieces.filter((p) => p.id !== entityId && !(room && p.floor === room.floor && p.x >= room.x && p.x <= room.x + room.width && p.z >= room.z && p.z <= room.z + room.depth));
  next.openings = next.openings.filter((o) => o.id !== entityId && o.roomId !== entityId);
  return next;
}
export function moveRoom(home: Home, roomId: string, point: Point): Home {
  const next = clone(home);
  const room = next.rooms.find((r) => r.id === roomId);
  if (!room) throw new Error("Room not found.");
  const dx = snap(point.x) - room.x, dz = snap(point.z) - room.z;
  const error = roomError(home, { ...room, x: room.x + dx, z: room.z + dz }, roomId);
  if (error) throw new Error(error);
  next.pieces.forEach((p) => {
    if (p.floor === room.floor && p.x >= room.x && p.x <= room.x + room.width && p.z >= room.z && p.z <= room.z + room.depth) { p.x += dx; p.z += dz; }
  });
  room.x += dx; room.z += dz;
  return next;
}
export function addOpening(home: Home, point: Point, floor: number, type: OpeningType): Home {
  let best: { room: Room; wall: Opening["wall"]; offset: number; distance: number } | undefined;
  for (const room of home.rooms.filter((r) => r.floor === floor)) {
    const options: [Opening["wall"], number, number, number][] = [
      ["north", point.x - room.x, Math.abs(point.z - room.z), room.width],
      ["south", point.x - room.x, Math.abs(point.z - room.z - room.depth), room.width],
      ["west", point.z - room.z, Math.abs(point.x - room.x), room.depth],
      ["east", point.z - room.z, Math.abs(point.x - room.x - room.width), room.depth],
    ];
    for (const [wall, offset, distance, length] of options) {
      const half = openingWidth(type) / 2;
      if (offset >= half && offset <= length - half && distance < 0.8 && (!best || distance < best.distance)) best = { room, wall, offset: Math.min(length - half, Math.max(half, snap(offset))), distance };
    }
  }
  if (!best) throw new Error("Click near a wall with enough space for this opening.");
  if (home.openings.some((o) => o.roomId === best.room.id && o.wall === best.wall && Math.abs(o.offset - best.offset) < (openingWidth(o.type) + openingWidth(type)) / 2 + 0.1)) throw new Error("There is already an opening here.");
  const next = clone(home);
  next.openings.push({ id: id(), roomId: best.room.id, wall: best.wall, offset: best.offset, type });
  return next;
}
export const PLAN_NAMES = ["Empty lot", "Studio", "One-bedroom", "Family home", "Courtyard", "Townhouse"] as const;
export function createPlan(plan: string): Home {
  const home: Home = { version: 1, name: plan, rooms: [], pieces: [], openings: [], exteriorFinish: 6 };
  const room = (name: string, x: number, z: number, width: number, depth: number, floor: 0 | 1 = 0, finish = 0) => {
    const r: Room = { id: id(), name, x, z, width, depth, floor, floorFinish: finish, wallFinish: 6 };
    home.rooms.push(r); return r;
  };
  const piece = (catalogId: string, x: number, z: number, rotation = 0, floor: 0 | 1 = 0) => {
    const entry = CATALOG_BY_ID.get(catalogId);
    if (!entry) throw new Error(`Unknown piece: ${catalogId}`);
    home.pieces.push({ id: id(), catalogId, x, z, rotation, floor, color: entry.color, scale: 1 });
  };
  if (plan === "Empty lot") return home;
  if (plan === "Studio") {
    room("Studio", -4, -3, 6, 6); room("Bathroom", 2, -3, 2, 3, 0, 3);
    piece("double-bed", -2.5, -1.5); piece("linen-sofa", -2, 1.5); piece("kitchen-counter", 0.5, -2);
  } else if (plan === "Family home") {
    room("Living & dining", -5, -4, 6, 8); room("Bedroom", 1, -4, 4, 4); room("Bedroom 2", 1, 0, 4, 4);
    piece("double-bed", 3, -2); piece("single-bed", 3, 2); piece("sage-sofa", -3, 0); piece("dining-table", -2, -2); piece("kitchen-counter", -4, -3, 90);
  } else if (plan === "Courtyard") {
    room("Living", -5, -4, 3, 8); room("Kitchen", -2, -4, 7, 3); room("Bedroom", 2, -1, 3, 5);
    piece("linen-sofa", -3.5, 1, 90); piece("double-bed", 3.5, 1.5); piece("kitchen-counter", 0, -3); piece("swimming-pool", 0, 2.5);
  } else if (plan === "Townhouse") {
    room("Living", -3, -4, 6, 5); room("Kitchen", -3, 1, 6, 3); room("Bedroom", -3, -4, 4, 5, 1); room("Upstairs bath", 1, -4, 2, 5, 1, 3);
    piece("linen-sofa", -1, -1); piece("kitchen-counter", -1, 3); piece("staircase", 2, -1.5); piece("double-bed", -1, -1.5, 0, 1); piece("bath-vanity", 2, -2.5, 90, 1);
  } else {
    home.name = "One-bedroom";
    room("Living & kitchen", -1, -3.5, 6, 7); room("Bedroom", -5, -3.5, 4, 4.5); room("Bathroom", -5, 1, 4, 2.5, 0, 3);
    piece("double-bed", -3, -1); piece("oak-nightstand", -4.25, -1.5); piece("oak-nightstand", -1.75, -1.5);
    piece("bedroom-rug", -3, -0.75); piece("wardrobe", -3, -3);
    piece("linen-sofa", 2, 1.75); piece("woven-rug", 2, 0.5); piece("round-coffee-table", 2, 0.25);
    piece("lounge-chair", 4, 0.25, -30); piece("floor-lamp", 0, 1.75);
    piece("media-console", 2, -1); piece("bookcase", 4, -2.75); piece("indoor-palm", 0, -0.75);
    piece("kitchen-counter", 0, -3); piece("kitchen-counter", 1.5, -3); piece("refrigerator", 3, -3);
    piece("kitchen-island", 1, -1.75); piece("bar-stool", 0.5, -0.75);
    piece("bath-vanity", -3, 1.5); piece("toilet", -4.25, 2.5); piece("freestanding-tub", -2.25, 2.25, 90);
  }
  const first = home.rooms[0];
  home.openings.push({ id: id(), roomId: first.id, wall: "north", offset: first.width / 2, type: "glass-door" });
  for (const r of home.rooms) {
    home.openings.push({ id: id(), roomId: r.id, wall: "east", offset: r.depth / 2, type: "window" });
  }
  piece("olive-tree", -7.5, -5); piece("maple-tree", 7.5, -4.5); piece("olive-tree", 7, 5);
  piece("timber-deck", -0.5, -5.25);
  for (let x = -8; x <= 8; x += 2) { piece("timber-fence", x, -7.5); piece("garden-hedge", x, 7.5); }
  for (let z = -5.5; z <= 5.5; z += 2) piece("timber-fence", -9.5, z, 90);
  piece("flower-bed", -3, 4.5); piece("flower-bed", 3.5, 4.5);
  piece("stone-paving", 0, 5); piece("garden-lantern", -1.5, 5); piece("garden-lantern", 1.5, 5);
  return home;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;
const finish = (v: unknown): v is number => finite(v) && Number.isInteger(v) && v >= 0 && v < FINISHES.length;
const level = (v: unknown): v is 0 | 1 => v === 0 || v === 1;
export function parseHome(input: unknown): Home {
  if (!record(input) || input.version !== 1 || !text(input.name) || !finish(input.exteriorFinish) || !Array.isArray(input.rooms) || !Array.isArray(input.pieces) || !Array.isArray(input.openings) || input.rooms.length > 100 || input.pieces.length > 1500 || input.openings.length > 500) throw new Error("This is not a supported Roomtone home.");
  const rooms: Room[] = input.rooms.map((r: unknown) => {
    if (!record(r) || !text(r.id) || !text(r.name) || !finite(r.x) || !finite(r.z) || !finite(r.width) || !finite(r.depth) || !level(r.floor) || !finish(r.floorFinish) || !finish(r.wallFinish)) throw new Error("The home contains an invalid room.");
    return { id: r.id, name: r.name, x: r.x, z: r.z, width: r.width, depth: r.depth, floor: r.floor, floorFinish: r.floorFinish, wallFinish: r.wallFinish };
  });
  const pieces: Piece[] = input.pieces.map((p: unknown) => {
    if (!record(p) || !text(p.id) || typeof p.catalogId !== "string" || !CATALOG_BY_ID.has(p.catalogId) || !finite(p.x) || !finite(p.z) || !level(p.floor) || !finite(p.rotation) || !finite(p.scale) || p.scale < 0.5 || p.scale > 3 || typeof p.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(p.color)) throw new Error("The home contains an invalid furniture piece.");
    return { id: p.id, catalogId: p.catalogId, x: p.x, z: p.z, floor: p.floor, rotation: p.rotation, scale: p.scale, color: p.color };
  });
  const openings: Opening[] = input.openings.map((o: unknown) => {
    if (!record(o) || !text(o.id) || !text(o.roomId) || !["north", "south", "east", "west"].includes(String(o.wall)) || !["door", "window", "glass-door", "garage-door"].includes(String(o.type)) || !finite(o.offset)) throw new Error("The home contains an invalid opening.");
    const wall = o.wall as Opening["wall"], type = o.type as OpeningType;
    const room = rooms.find((r) => r.id === o.roomId);
    const half = openingWidth(type) / 2;
    if (!room || o.offset < half || o.offset > (wall === "north" || wall === "south" ? room.width : room.depth) - half) throw new Error("The home contains an opening outside its wall.");
    return { id: o.id, roomId: o.roomId, wall, offset: o.offset, type };
  });
  const home: Home = { version: 1, name: input.name, rooms, pieces, openings, exteriorFinish: input.exteriorFinish };
  const ids = [...rooms, ...pieces, ...openings].map((entity) => entity.id);
  if (new Set(ids).size !== ids.length) throw new Error("The home contains duplicate identifiers.");
  for (const room of rooms) { const error = roomError(home, room, room.id); if (error) throw new Error(error); }
  for (const piece of pieces) { const error = pieceError(home, piece); if (error) throw new Error(error); }
  for (let i = 0; i < openings.length; i++) {
    const a = openings[i];
    if (openings.slice(i + 1).some((b) => b.roomId === a.roomId && b.wall === a.wall && Math.abs(a.offset - b.offset) < (openingWidth(a.type) + openingWidth(b.type)) / 2)) throw new Error("The home contains overlapping wall openings.");
  }
  return home;
}
export function homeValue(home: Home) {
  return home.rooms.reduce((sum, room) => sum + room.width * room.depth * 1650, 0) + home.pieces.reduce((sum, p) => sum + (CATALOG_BY_ID.get(p.catalogId)?.price ?? 0) * p.scale, 0) + home.openings.length * 350;
}
