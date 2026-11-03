export type Category = "Living" | "Bedroom" | "Kitchen" | "Bath" | "Garage" | "Garden";
export type Shape = "sofa" | "chair" | "table" | "bed" | "cabinet" | "shelf" | "lamp" | "plant" | "rug" | "counter" | "appliance" | "sink" | "toilet" | "tub" | "car" | "tree" | "pool" | "deck" | "fence" | "hedge" | "flowers" | "stairs" | "art";
export interface CatalogItem {
  id: string;
  name: string;
  category: Category;
  shape: Shape;
  width: number;
  depth: number;
  height: number;
  color: string;
  price: number;
}

const entries: [string, Category, Shape, number, number, number, string, number][] = [
  ["Linen sofa", "Living", "sofa", 2.4, 1, 0.85, "#e6dfcf", 755],
  ["Sage sofa", "Living", "sofa", 2.8, 1, 0.85, "#9ba68c", 990],
  ["Corner sofa", "Living", "sofa", 3.2, 1.5, 0.85, "#d1c8b8", 2060],
  ["Lounge chair", "Living", "chair", 0.85, 0.9, 0.9, "#e1d8bd", 395],
  ["Olive ottoman", "Living", "table", 0.7, 0.7, 0.45, "#828b61", 215],
  ["Round coffee table", "Living", "table", 1.2, 1.2, 0.4, "#d5c09a", 540],
  ["Walnut coffee table", "Living", "table", 1.4, 0.7, 0.4, "#8d5940", 360],
  ["Side table", "Living", "table", 0.55, 0.55, 0.6, "#cbb99a", 240],
  ["Media console", "Living", "cabinet", 1.8, 0.45, 0.6, "#c4b694", 505],
  ["Bookcase", "Living", "shelf", 1.2, 0.35, 1.9, "#d7c6a5", 460],
  ["Low sideboard", "Living", "cabinet", 1.8, 0.5, 0.75, "#bea887", 460],
  ["Floor lamp", "Living", "lamp", 0.45, 0.45, 1.6, "#3c3c35", 340],
  ["Woven rug", "Living", "rug", 3, 2, 0.03, "#c4b3a0", 180],
  ["Indoor palm", "Living", "plant", 0.6, 0.6, 1.4, "#567451", 165],
  ["Abstract print", "Living", "art", 0.8, 0.15, 1.1, "#a28c66", 120],
  ["Double bed", "Bedroom", "bed", 1.8, 2.2, 0.65, "#e4ddcb", 1250],
  ["Single bed", "Bedroom", "bed", 1, 2, 0.65, "#bdc5b7", 650],
  ["Oak nightstand", "Bedroom", "cabinet", 0.5, 0.45, 0.55, "#c2a581", 190],
  ["Wardrobe", "Bedroom", "cabinet", 1.5, 0.6, 2, "#e1d8c6", 870],
  ["Dresser", "Bedroom", "cabinet", 1.2, 0.5, 0.85, "#bb9c78", 420],
  ["Desk", "Bedroom", "table", 1.2, 0.6, 0.75, "#c6ad88", 290],
  ["Desk chair", "Bedroom", "chair", 0.55, 0.55, 0.85, "#828a79", 180],
  ["Bedside lamp", "Bedroom", "lamp", 0.3, 0.3, 0.65, "#e6d6ab", 95],
  ["Bedroom rug", "Bedroom", "rug", 2.5, 1.6, 0.03, "#b6bcb0", 145],
  ["Dressing mirror", "Bedroom", "art", 0.65, 0.15, 1.7, "#b6c9c7", 210],
  ["Kitchen counter", "Kitchen", "counter", 1.5, 0.65, 0.9, "#d6ceb9", 480],
  ["Kitchen island", "Kitchen", "counter", 2, 1, 0.9, "#a7af99", 950],
  ["Refrigerator", "Kitchen", "appliance", 0.75, 0.7, 1.8, "#d5d8d2", 790],
  ["Range cooker", "Kitchen", "appliance", 0.7, 0.65, 0.9, "#535a58", 620],
  ["Kitchen sink", "Kitchen", "sink", 1, 0.65, 0.9, "#c9c5b5", 360],
  ["Dining table", "Kitchen", "table", 1.8, 1, 0.75, "#c5aa80", 640],
  ["Dining chair", "Kitchen", "chair", 0.5, 0.5, 0.85, "#dbcbb0", 145],
  ["Bar stool", "Kitchen", "chair", 0.45, 0.45, 1.05, "#8d735b", 125],
  ["Wall shelves", "Kitchen", "shelf", 1.3, 0.3, 1.6, "#aa8863", 185],
  ["Pendant light", "Kitchen", "lamp", 0.5, 0.5, 2.1, "#d7b87e", 230],
  ["Bath vanity", "Bath", "sink", 1.2, 0.6, 0.85, "#c7bca5", 530],
  ["Toilet", "Bath", "toilet", 0.5, 0.75, 0.8, "#f0eee6", 280],
  ["Freestanding tub", "Bath", "tub", 0.9, 1.8, 0.6, "#e9e7df", 1100],
  ["Shower tray", "Bath", "pool", 1, 1, 0.15, "#bdcecc", 640],
  ["Towel cabinet", "Bath", "shelf", 0.6, 0.35, 1.6, "#cfbea3", 190],
  ["Bath mat", "Bath", "rug", 0.8, 0.5, 0.03, "#a0b4ab", 35],
  ["Bathroom plant", "Bath", "plant", 0.4, 0.4, 0.7, "#65846b", 65],
  ["Compact car", "Garage", "car", 1.8, 3.8, 1.25, "#829393", 18900],
  ["Workbench", "Garage", "table", 1.8, 0.7, 0.9, "#9a7c59", 390],
  ["Tool cabinet", "Garage", "cabinet", 1, 0.5, 1.2, "#708378", 320],
  ["Storage rack", "Garage", "shelf", 1.3, 0.5, 1.8, "#747b72", 220],
  ["Staircase", "Garage", "stairs", 1, 3, 3, "#cbb99a", 1800],
  ["Olive tree", "Garden", "tree", 1.7, 1.7, 3.8, "#657e4b", 420],
  ["Maple tree", "Garden", "tree", 2, 2, 4.2, "#6d874b", 510],
  ["Cypress", "Garden", "tree", 0.9, 0.9, 3.2, "#3f694a", 240],
  ["Swimming pool", "Garden", "pool", 3, 5, 0.2, "#6caeaf", 6500],
  ["Timber deck", "Garden", "deck", 3, 3, 0.12, "#a38460", 1250],
  ["Stone paving", "Garden", "deck", 2, 2, 0.08, "#c8c6b7", 260],
  ["Flower bed", "Garden", "flowers", 1.8, 0.6, 0.35, "#ba896f", 135],
  ["Timber fence", "Garden", "fence", 2, 0.15, 1.3, "#896848", 95],
  ["Garden hedge", "Garden", "hedge", 2, 0.6, 0.9, "#4e7043", 120],
  ["Outdoor bench", "Garden", "sofa", 1.7, 0.6, 0.85, "#ad8962", 320],
  ["Patio table", "Garden", "table", 1.1, 1.1, 0.75, "#c6b894", 280],
  ["Sun lounger", "Garden", "bed", 0.75, 1.8, 0.4, "#d0c7ab", 350],
  ["Garden lantern", "Garden", "lamp", 0.25, 0.25, 0.65, "#4b5550", 75],
  ["Terracotta pot", "Garden", "plant", 0.6, 0.6, 0.8, "#9d6b51", 85],
  ["Wildflower patch", "Garden", "flowers", 1.5, 1.5, 0.4, "#b5a276", 95],
  ["Gravel path", "Garden", "deck", 1, 2, 0.05, "#d4cdbf", 90],
];

export const CATALOG: CatalogItem[] = entries.map(([name, category, shape, width, depth, height, color, price]) => ({
  id: name.toLowerCase().replaceAll(" ", "-"), name, category, shape, width, depth, height, color, price,
}));
export const CATEGORIES: Category[] = ["Living", "Bedroom", "Kitchen", "Bath", "Garage", "Garden"];
export const CATALOG_BY_ID = new Map(CATALOG.map((item) => [item.id, item]));
export const FINISHES = [
  { name: "Warm oak", color: "#d3bf9b", pattern: "timber" },
  { name: "Pale ash", color: "#e3d8bf", pattern: "timber" },
  { name: "Walnut", color: "#8e6c50", pattern: "timber" },
  { name: "Limestone", color: "#d7d3c4", pattern: "tile" },
  { name: "Sage tile", color: "#abb8a0", pattern: "tile" },
  { name: "Terracotta", color: "#ba8970", pattern: "tile" },
  { name: "Chalk", color: "#ece5d7", pattern: "paint" },
  { name: "Olive", color: "#a4ae8a", pattern: "paint" },
  { name: "Clay", color: "#c6a694", pattern: "paint" },
  { name: "Brick", color: "#a97761", pattern: "brick" },
  { name: "Linen wallpaper", color: "#d5c8b0", pattern: "wallpaper" },
  { name: "Midnight", color: "#667678", pattern: "paint" },
] as const;
