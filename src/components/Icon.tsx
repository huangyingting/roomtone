import type { CSSProperties } from "react";
export type IconName = "layout" | "furnish" | "style" | "garden" | "sun" | "undo" | "redo" | "grid" | "roof" | "save" | "folder" | "camera" | "home" | "help" | "rotate" | "trash" | "close" | "plus" | "select" | "download" | "upstairs" | "search" | "check";
const paths: Record<IconName, React.ReactNode> = {
  layout: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M13 4v16M4 13h9M13 9h7" /></>,
  furnish: <><path d="M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M4 11a2 2 0 0 1 2 2v3h12v-3a2 2 0 0 1 4 0v5H2v-5a2 2 0 0 1 2-2ZM5 18v2m14-2v2" /></>,
  style: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="m17 13 4 4-4 4-4-4Z" /></>,
  garden: <><path d="M12 21V10M12 14C4 14 3 9 4 5c5-1 8 2 8 6m0 0c0-5 4-7 8-6 1 5-2 8-8 8" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  undo: <path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" />,
  redo: <path d="m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" />,
  grid: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M9 4v16m6-16v16M4 9h16M4 15h16" /></>,
  roof: <><path d="m2 12 10-9 10 9M5 10v11h14V10M10 21v-7h4v7" /></>,
  save: <><path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h10V3M7 21v-8h10v8" /></>,
  folder: <path d="M3 6h7l2 3h9v11H3Z" />,
  camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3Z" /><circle cx="12" cy="13" r="4" /></>,
  home: <><path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3h.01" /></>,
  rotate: <><path d="M20 9a8 8 0 1 0 0 7M20 3v6h-6" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  select: <path d="m5 3 14 10-7 1-3 7Z" />,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
  upstairs: <path d="M3 20h5v-5h5v-5h5V5h3M3 4h9m-4 4 4-4-4-3" />,
  search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
  check: <path d="m5 12 4 4L20 5" />,
};
export default function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}
