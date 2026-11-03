"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CATALOG, CATALOG_BY_ID, CATEGORIES, FINISHES, type Category } from "@/lib/catalog";
import { addOpening, clone, createPlan, homeValue, id, moveRoom, parseHome, pieceError, PLAN_NAMES, removeEntity, roomAt, roomError, snap, type Home, type OpeningType, type Piece, type Room, type SceneAction, type SceneTool, type ViewSettings } from "@/lib/model";
import { historyReducer, initialHistory } from "@/lib/history";
import { AUTOSAVE_KEY, errorMessage, readAutosave, readSaves, SAVES_KEY, type SavedHome } from "@/lib/storage";
import Icon, { type IconName } from "./Icon";
import Thumbnail from "./Thumbnail";

const SceneCanvas = dynamic(() => import("./SceneCanvas"), { ssr: false });
type Tab = "Layout" | "Furnish" | "Style" | "Decorate" | "Lighting";
const tabs: { name: Tab; icon: IconName }[] = [{ name: "Layout", icon: "layout" }, { name: "Furnish", icon: "furnish" }, { name: "Style", icon: "style" }, { name: "Decorate", icon: "garden" }, { name: "Lighting", icon: "sun" }];
const defaultView: ViewSettings = { floor: 0, roof: false, grid: false, time: 14, quality: "auto", focusRoomId: null };
const selectTool: SceneTool = { kind: "select", rotation: 0 };
type StorageStatus = { label: string; error: string | null; savedHome: Home | null };
type StorageAction = { type: "saving" | "clear" } | { type: "saved"; home: Home } | { type: "blocked" | "failed"; error: string };
function storageReducer(state: StorageStatus, action: StorageAction): StorageStatus {
  if (action.type === "clear") return { ...state, error: null };
  if (action.type === "blocked" || action.type === "failed") return { ...state, label: "Autosave needs attention", error: action.error };
  if (action.type === "saved") return { label: "Saved on this device", error: null, savedHome: action.home };
  return { ...state, label: "Saving on this device…", error: null };
}
function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ToolButton({ icon, label, active, disabled, onClick }: { icon: IconName; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button className={`tool-button${active ? " active" : ""}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}><Icon name={icon} /></button>;
}

export default function Designer() {
  const [history, dispatch] = useReducer(historyReducer, initialHistory);
  const [storageStatus, storageDispatch] = useReducer(storageReducer, { label: "Opening home…", error: null, savedHome: null });
  const [tab, setTab] = useState<Tab>("Furnish");
  const [category, setCategory] = useState<Category>("Living");
  const [query, setQuery] = useState("");
  const [viewState, setView] = useState<ViewSettings>(defaultView);
  const view = useMemo(() => viewState.focusRoomId && !history.home?.rooms.some((room) => room.id === viewState.focusRoomId) ? { ...viewState, focusRoomId: null } : viewState, [viewState, history.home?.rooms]);
  const [tool, setTool] = useState<SceneTool>(selectTool);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [modal, setModal] = useState<"plans" | "saves" | "help" | null>(null);
  const [saves, setSaves] = useState<SavedHome[]>([]);
  const [openingType, setOpeningType] = useState<OpeningType>("window");
  const [finishTarget, setFinishTarget] = useState<"floor" | "wall" | "exterior">("floor");
  const [finishIndex, setFinishIndex] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const initialized = useRef(false);
  const autosaveBlocked = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const notify = (text: string, error = false) => setNotice({ text, error });

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    let restored: Home | null = null;
    try { restored = readAutosave(); }
    catch (error) { autosaveBlocked.current = true; storageDispatch({ type: "blocked", error: `Autosave could not be restored: ${errorMessage(error)} Use a new plan to start fresh.` }); }
    dispatch({ type: "load", home: restored ?? createPlan("One-bedroom") });
  }, []);
  useEffect(() => {
    if (!history.home || autosaveBlocked.current) return;
    storageDispatch({ type: "saving" });
    const timeout = setTimeout(() => {
      try {
        if (!history.home) return;
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(history.home)); storageDispatch({ type: "saved", home: history.home });
      }
      catch (error) { storageDispatch({ type: "failed", error: `Autosave failed: ${errorMessage(error)} Export your home to keep a copy.` }); }
    }, 500);
    return () => clearTimeout(timeout);
  }, [history.home]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timeout = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    const dialog = modalRef.current;
    if (modal && dialog && !dialog.open) dialog.showModal();
    else if (!modal && dialog?.open) dialog.close();
  }, [modal]);
  useEffect(() => {
    const flush = () => {
      if (!history.home || autosaveBlocked.current) return;
      try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(history.home)); storageDispatch({ type: "saved", home: history.home }); }
      catch (error) { storageDispatch({ type: "failed", error: `Save failed: ${errorMessage(error)}` }); }
    };
    const visibility = () => { if (document.hidden) flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", visibility); };
  }, [history.home]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key === "Escape") { setTool(selectTool); setSelectedId(null); setModal(null); }
      if (modal) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); setSelectedId(null);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault(); dispatch({ type: "redo" }); setSelectedId(null);
      }
      if (event.key.toLowerCase() === "r") {
        if (tool.kind === "place") setTool((t) => ({ ...t, rotation: (t.rotation + 90) % 360 }));
        else if (selectedId && history.home) {
          const next = clone(history.home), piece = next.pieces.find((p) => p.id === selectedId);
          if (piece) {
            piece.rotation = (piece.rotation + 90) % 360;
            const error = pieceError(next, piece);
            if (error) setNotice({ text: error, error: true }); else dispatch({ type: "commit", home: next });
          }
        }
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId && history.home) {
        event.preventDefault(); dispatch({ type: "commit", home: removeEntity(history.home, selectedId) }); setSelectedId(null);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [history.home, modal, selectedId, tool.kind]);

  const home = history.home;
  const storageLabel = !home ? "Opening home…" : storageStatus.label === "Autosave needs attention" ? storageStatus.label : storageStatus.savedHome === home ? "Saved on this device" : "Saving on this device…";
  const selectedPiece = home?.pieces.find((p) => p.id === selectedId);
  const selectedRoom = home?.rooms.find((r) => r.id === selectedId);
  const selectedOpening = home?.openings.find((o) => o.id === selectedId);
  const activeEntry = tool.catalogId ? CATALOG_BY_ID.get(tool.catalogId) : undefined;
  const commit = (next: Home) => {
    dispatch({ type: "commit", home: next });
    if (!autosaveBlocked.current) storageDispatch({ type: "saving" });
  };
  const displayNotice = notice ?? (storageStatus.error ? { text: storageStatus.error, error: true } : null);
  const transact = (operation: () => void) => {
    try { operation(); }
    catch (error) { notify(errorMessage(error), true); }
  };
  const applyFinish = (roomId: string | null) => {
    if (!home) return;
    const next = clone(home);
    if (finishTarget === "exterior") next.exteriorFinish = finishIndex;
    else {
      const room = next.rooms.find((r) => r.id === roomId);
      if (!room) throw new Error("Choose a room or click its floor to apply a finish.");
      if (finishTarget === "floor") room.floorFinish = finishIndex; else room.wallFinish = finishIndex;
    }
    commit(next);
  };
  const onAction = (action: SceneAction) => transact(() => {
    if (!home) return;
    if (action.type === "select") { setSelectedId(action.id); return; }
    if (action.type === "focus") { setView((v) => ({ ...v, focusRoomId: v.focusRoomId === action.id ? null : action.id })); return; }
    if (action.type === "paint") { applyFinish(roomAt(home, action.point, view.floor)?.id ?? action.id); return; }
    if (action.type === "erase") {
      if (action.id) { commit(removeEntity(home, action.id)); setSelectedId(null); }
      else throw new Error("Click a piece, room, or opening to remove it.");
      return;
    }
    if (action.type === "opening") { commit(addOpening(home, action.point, view.floor, openingType)); return; }
    if (action.type === "place") {
      if (!activeEntry) throw new Error("Choose a piece first.");
      if (home.pieces.length >= 1500) throw new Error("This lot supports up to 1,500 pieces.");
      const piece: Piece = { id: id(), catalogId: activeEntry.id, ...action.point, x: snap(action.point.x), z: snap(action.point.z), floor: view.floor, rotation: tool.rotation, color: activeEntry.color, scale: 1 };
      const error = pieceError(home, piece);
      if (error) throw new Error(error);
      const next = clone(home); next.pieces.push(piece); commit(next); setSelectedId(piece.id);
      return;
    }
    if (action.type === "drawRoom") {
      if (home.rooms.length >= 100) throw new Error("This lot supports up to 100 rooms.");
      const x = snap(Math.min(action.point.x, action.endPoint.x)), z = snap(Math.min(action.point.z, action.endPoint.z));
      const room: Room = { id: id(), name: `Room ${home.rooms.length + 1}`, x, z, width: snap(Math.abs(action.point.x - action.endPoint.x)), depth: snap(Math.abs(action.point.z - action.endPoint.z)), floor: view.floor, floorFinish: 0, wallFinish: 6 };
      const error = roomError(home, room);
      if (error) throw new Error(error);
      const next = clone(home); next.rooms.push(room); commit(next); setSelectedId(room.id);
      return;
    }
    if (action.type === "move") {
      if (home.rooms.some((r) => r.id === action.id)) commit(moveRoom(home, action.id, action.point));
      else {
        const next = clone(home), piece = next.pieces.find((p) => p.id === action.id);
        if (!piece) throw new Error("Only rooms and furniture can be moved.");
        piece.x = snap(action.point.x); piece.z = snap(action.point.z);
        const error = pieceError(next, piece);
        if (error) throw new Error(error);
        commit(next);
      }
    }
  });
  const updatePiece = (changes: Partial<Piece>) => transact(() => {
    if (!home || !selectedPiece) return;
    const next = clone(home), piece = next.pieces.find((p) => p.id === selectedPiece.id)!;
    Object.assign(piece, changes);
    const error = pieceError(next, piece);
    if (error) throw new Error(error);
    commit(next);
  });
  const updateRoom = (changes: Partial<Room>) => transact(() => {
    if (!home || !selectedRoom) return;
    let next: Home;
    if (changes.x !== undefined || changes.z !== undefined) next = moveRoom(home, selectedRoom.id, { x: changes.x ?? selectedRoom.x, z: changes.z ?? selectedRoom.z });
    else {
      next = clone(home);
      Object.assign(next.rooms.find((r) => r.id === selectedRoom.id)!, changes);
      parseHome(next);
    }
    commit(next);
  });
  const openLibrary = () => transact(() => { setSaves(readSaves()); setModal("saves"); });
  const saveHome = () => transact(() => {
    if (!home) return;
    const library = readSaves();
    if (library.length >= 30) throw new Error("Your library is full. Remove a saved home to make space.");
    library.unshift({ id: id(), savedAt: new Date().toISOString(), home: clone(home) });
    localStorage.setItem(SAVES_KEY, JSON.stringify(library)); setSaves(library); notify("A copy of your home is saved in your library.");
  });
  const setPlan = (plan: string) => {
    const next = createPlan(plan);
    parseHome(next);
    autosaveBlocked.current = false;
    commit(next); setSelectedId(null); setView(defaultView); setTool(selectTool); setModal(null);
    notify(`${plan === "Empty lot" ? "A fresh canvas" : plan} is ready. Your previous design is available with Undo.`);
  };
  const changeTab = (next: Tab) => { setTab(next); setQuery(""); setTool(selectTool); if (next === "Decorate") setCategory("Garden"); else if (next === "Furnish" && category === "Garden") setCategory("Living"); };
  const filtered = CATALOG.filter((entry) => entry.category === (tab === "Decorate" ? "Garden" : category) && entry.name.toLowerCase().includes(query.toLowerCase()));
  const screenshot = () => transact(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='scene-canvas']");
    if (!canvas) throw new Error("The scene is not ready yet.");
    canvas.dispatchEvent(new Event("roomtone-capture"));
    canvas.toBlob((blob) => {
      if (!blob) { notify("Snapshot could not be captured. Please try again.", true); return; }
      download(blob, "roomtone-home.png"); notify("Snapshot downloaded.");
    }, "image/png");
  });

  return <main className="designer">
    <div className="world">
      {home && <SceneCanvas home={home} view={view} tool={tool} selectedId={selectedId} onAction={onAction} onReady={() => setReady(true)} onError={setSceneError} />}
      {!ready && !sceneError && <div className="scene-loading"><span className="loading-mark"><Icon name="home" size={36} /></span><h1>Roomtone</h1><p>Making a little room for you…</p></div>}
      {sceneError && <div className="scene-loading" role="alert"><Icon name="home" size={36} /><h2>We couldn’t open the 3D view</h2><p>{sceneError}</p><p>Enable hardware acceleration and reload in a WebGL-capable browser. Your home is still available to export.</p></div>}
      <div className="scene-caption"><span className="eyebrow">A LITTLE SPACE OF YOUR OWN</span><span>{view.focusRoomId ? "Room view · double-click to return" : "Your home, your pace."}</span></div>
      <div className="view-badge"><span className="status-dot" />{view.floor === 0 ? "Ground floor" : "Upstairs"}<span className="badge-divider" />{view.time < 6 || view.time >= 20 ? "Night" : view.time < 10 ? "Morning" : view.time < 17 ? "Afternoon" : "Golden hour"}</div>
      {tool.kind !== "select" && <div className="placement-banner">{tool.kind === "place" ? <><strong>{activeEntry?.name}</strong> · {tool.rotation}° <button onClick={() => setTool((t) => ({ ...t, rotation: (t.rotation + 90) % 360 }))} aria-label="Rotate placement"><Icon name="rotate" size={16} /></button></> : tool.kind === "room" ? "Drag across the grid to draw a room" : tool.kind === "opening" ? "Click near a wall to add an opening" : tool.kind === "paint" ? "Click a room to apply your finish" : "Click an object to remove it"}<button onClick={() => setTool(selectTool)} aria-label="Cancel tool"><Icon name="close" size={16} /></button></div>}
      <div className="toolbar" role="toolbar" aria-label="Home design tools">
        <ToolButton icon="undo" label="Undo" disabled={!history.past.length} onClick={() => { dispatch({ type: "undo" }); setSelectedId(null); }} />
        <ToolButton icon="redo" label="Redo" disabled={!history.future.length} onClick={() => { dispatch({ type: "redo" }); setSelectedId(null); }} />
        <span className="toolbar-divider" />
        <ToolButton icon="select" label="Select and move" active={tool.kind === "select"} onClick={() => setTool(selectTool)} />
        <ToolButton icon="grid" label="Toggle grid" active={view.grid} onClick={() => setView((v) => ({ ...v, grid: !v.grid }))} />
        <ToolButton icon="roof" label="Toggle roof" active={view.roof} onClick={() => setView((v) => ({ ...v, roof: !v.roof }))} />
        <ToolButton icon="upstairs" label="Switch floor" active={view.floor === 1} onClick={() => { setView((v) => ({ ...v, floor: v.floor === 0 ? 1 : 0, focusRoomId: null })); setSelectedId(null); }} />
        <span className="toolbar-divider" />
        <ToolButton icon="save" label="Save home" onClick={saveHome} disabled={!home} />
        <ToolButton icon="folder" label="Saved homes" onClick={openLibrary} />
        <ToolButton icon="camera" label="Download snapshot" onClick={screenshot} disabled={!ready || !!sceneError} />
        <ToolButton icon="home" label="Choose a floor plan" onClick={() => setModal("plans")} />
        <ToolButton icon="help" label="Help and controls" onClick={() => setModal("help")} />
      </div>
      <p className="scene-controls">Right-drag to orbit <span>·</span> Scroll to zoom <span>·</span> R to rotate</p>
    </div>
    <button className="mobile-panel-toggle" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}>{panelOpen ? "Hide designer" : "Open designer"}<Icon name={panelOpen ? "close" : "furnish"} size={16} /></button>
    <aside className={`panel${panelOpen ? "" : " panel-hidden"}`} aria-label="Designer panel">
      <header className="panel-header"><div><h1>Roomtone<span className="brand-dot">.</span></h1><p>Make yourself at home.</p></div><button className="icon-button" onClick={() => setModal("help")} aria-label="About Roomtone"><Icon name="help" size={19} /></button></header>
      <nav className="tabs" aria-label="Design sections">{tabs.map(({ name, icon }) => <button key={name} className={tab === name ? "tab active" : "tab"} aria-pressed={tab === name} onClick={() => changeTab(name)}><Icon name={icon} /><span>{name}</span></button>)}</nav>
      <section className="home-summary"><div className="home-name"><input aria-label="Home name" value={home?.name ?? ""} maxLength={100} onChange={(e) => { if (home && e.target.value.trim()) commit({ ...home, name: e.target.value }); }} /><span>{home?.rooms.reduce((sum, r) => sum + r.width * r.depth, 0) ?? 0} m² · {home?.pieces.length ?? 0} pieces</span></div><p>Home value <strong>{home ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(homeValue(home)) : "$0"}</strong></p><select aria-label="Focus room" value={view.focusRoomId ?? ""} onChange={(e) => setView((v) => ({ ...v, focusRoomId: e.target.value || null, floor: home?.rooms.find((r) => r.id === e.target.value)?.floor ?? v.floor }))}><option value="">Whole home</option>{home?.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}{r.floor === 1 ? " · upstairs" : ""}</option>)}</select></section>
      <div className="panel-content">
        {(tab === "Furnish" || tab === "Decorate") && <>
          {tab === "Furnish" ? <div className="category-tabs" aria-label="Furniture categories">{CATEGORIES.filter((c) => c !== "Garden").map((c) => <button key={c} className={category === c ? "active" : ""} onClick={() => { setCategory(c); setQuery(""); }}>{c}</button>)}</div> : <div className="section-heading"><h2>A little more outdoors</h2><p>Plant, pave, and make space to unwind.</p></div>}
          <label className="search"><Icon name="search" size={17} /><input aria-label="Search furniture" placeholder={tab === "Decorate" ? "Find something for the garden…" : "Find your next favorite piece…"} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <p className="hint">Choose a piece, then click {tab === "Decorate" ? "in the garden" : "in a room"} to place it.</p>
          <div className="catalog">{filtered.map((entry) => <button key={entry.id} className={`catalog-card${tool.catalogId === entry.id && tool.kind === "place" ? " selected" : ""}`} aria-label={`Place ${entry.name}`} aria-pressed={tool.catalogId === entry.id && tool.kind === "place"} onClick={() => { setTool({ kind: "place", catalogId: entry.id, rotation: 0 }); setView((v) => ({ ...v, roof: false })); }}><Thumbnail item={entry} /><span className="piece-name">{entry.name}</span><span className="price">${entry.price.toLocaleString()}</span></button>)}</div>
          {!filtered.length && <p className="empty-state">No pieces found. Try another search.</p>}
        </>}
        {tab === "Layout" && <>
          <div className="section-heading"><h2>Room to grow</h2><p>Draw the shape of your everyday life.</p></div>
          <div className="action-grid"><button className={tool.kind === "room" ? "action-card active" : "action-card"} onClick={() => { setTool({ kind: "room", rotation: 0 }); setView((v) => ({ ...v, grid: true, roof: false })); }}><Icon name="layout" /><strong>Draw a room</strong><span>Drag on the lot</span></button><button className="action-card" onClick={() => setModal("plans")}><Icon name="home" /><strong>Start with a plan</strong><span>Five furnished homes</span></button></div>
          <h3>Doors & windows</h3><div className="opening-options">{(["door", "window", "glass-door", "garage-door"] as OpeningType[]).map((kind) => <button key={kind} className={tool.kind === "opening" && openingType === kind ? "choice active" : "choice"} onClick={() => { setOpeningType(kind); setTool({ kind: "opening", rotation: 0 }); }}>{kind.replaceAll("-", " ")}</button>)}</div><p className="hint">Click close to a wall. Openings need clear space.</p>
          <h3>Floors</h3><div className="segmented">{([0, 1] as const).map((floor) => <button key={floor} className={view.floor === floor ? "active" : ""} onClick={() => { setView((v) => ({ ...v, floor, roof: false, focusRoomId: null })); setSelectedId(null); }}>{floor === 0 ? "Ground floor" : "Upstairs"}</button>)}</div><p className="hint">Draw rooms upstairs and add a staircase from Garage.</p>
          <h3>Rooms on this floor</h3><div className="room-list">{home?.rooms.filter((r) => r.floor === view.floor).map((r) => <button key={r.id} className={selectedId === r.id ? "active" : ""} onClick={() => { setSelectedId(r.id); setTool(selectTool); }}><span>{r.name}</span><small>{r.width} × {r.depth} m</small></button>)}</div>
          {!home?.rooms.some((r) => r.floor === view.floor) && <p className="empty-state">A blank canvas. Draw your first room.</p>}
          <button className="text-button danger" onClick={() => setTool({ kind: "erase", rotation: 0 })}><Icon name="trash" size={16} />Remove tool</button>
        </>}
        {tab === "Style" && <>
          <div className="section-heading"><h2>The finishing touches</h2><p>Quiet textures. Colors that feel like you.</p></div><div className="segmented">{(["floor", "wall", "exterior"] as const).map((target) => <button key={target} className={finishTarget === target ? "active" : ""} onClick={() => setFinishTarget(target)}>{target === "floor" ? "Floors" : target === "wall" ? "Walls" : "Outside"}</button>)}</div><div className="finish-grid">{FINISHES.map((finish, index) => <button key={finish.name} className={finishIndex === index ? "finish-card active" : "finish-card"} onClick={() => { setFinishIndex(index); setTool({ kind: "paint", rotation: 0 }); }}><span className={`finish-swatch pattern-${finish.pattern}`} style={{ backgroundColor: finish.color }}>{finishIndex === index && <Icon name="check" />}</span><span>{finish.name}</span></button>)}</div><p className="hint">Choose a finish, then click a room. Outside applies to the whole home.</p><button className="primary-button" onClick={() => transact(() => applyFinish(selectedRoom?.id ?? view.focusRoomId))}>{finishTarget === "exterior" ? "Apply to exterior" : "Apply to selected room"}</button>
        </>}
        {tab === "Lighting" && <>
          <div className="section-heading"><h2>Set a softer mood</h2><p>From the first light to the last cup of tea.</p></div><div className="time-display"><Icon name="sun" size={36} /><strong>{String(Math.floor(view.time)).padStart(2, "0")}:{view.time % 1 >= 0.5 ? "30" : "00"}</strong><span>{view.time < 6 || view.time >= 20 ? "Windows glow. The world slows down." : view.time >= 17 ? "A golden hour, all your own." : "Let a little sunshine in."}</span></div><label className="range-label">Time of day<input aria-label="Time of day" type="range" min="0" max="23.5" step=".5" value={view.time} onChange={(e) => setView((v) => ({ ...v, time: Number(e.target.value) }))} /></label><div className="time-presets">{[{ name: "Morning", time: 8 }, { name: "Day", time: 14 }, { name: "Sunset", time: 18 }, { name: "Night", time: 22 }].map((preset) => <button key={preset.name} className={view.time === preset.time ? "choice active" : "choice"} onClick={() => setView((v) => ({ ...v, time: preset.time }))}>{preset.name}</button>)}</div><h3>Rendering quality</h3><select aria-label="Rendering quality" className="full-select" value={view.quality} onChange={(e) => setView((v) => ({ ...v, quality: e.target.value as ViewSettings["quality"] }))}><option value="auto">Balanced · recommended</option><option value="high">High · sharper shadows</option><option value="low">Lightweight · lower GPU load</option></select><p className="hint">The scene renders only when something changes. No idle animation, no wasted frames.</p>
        </>}
        {(selectedPiece || selectedRoom || selectedOpening) && <section className="inspector" aria-label="Selection settings"><div className="inspector-heading"><h3>{selectedPiece ? CATALOG_BY_ID.get(selectedPiece.catalogId)?.name : selectedRoom ? "Room settings" : "Opening"}</h3><button className="icon-button" aria-label="Deselect" onClick={() => setSelectedId(null)}><Icon name="close" size={16} /></button></div>
          {selectedPiece && <><div className="inspector-row"><label>Color<input aria-label="Piece color" type="color" value={selectedPiece.color} onChange={(e) => updatePiece({ color: e.target.value })} /></label><button className="choice" aria-label="Rotate selected piece" onClick={() => updatePiece({ rotation: (selectedPiece.rotation + 90) % 360 })}><Icon name="rotate" size={16} />{selectedPiece.rotation}°</button></div><label className="range-label">{CATALOG_BY_ID.get(selectedPiece.catalogId)?.shape === "counter" ? "Length" : "Size"} · {selectedPiece.scale.toFixed(1)}×<input aria-label="Piece size" type="range" min=".5" max="3" step=".1" value={selectedPiece.scale} onChange={(e) => updatePiece({ scale: Number(e.target.value) })} /></label><div className="dimensions">{(["x", "z"] as const).map((field) => <label key={field}>{field.toUpperCase()}<input aria-label={`Piece ${field}`} type="number" step=".5" value={selectedPiece[field]} onChange={(e) => updatePiece({ [field]: snap(Number(e.target.value)) })} /></label>)}</div></>}
          {selectedRoom && <><label className="field-label">Room name<input aria-label="Room name" value={selectedRoom.name} maxLength={100} onChange={(e) => { if (e.target.value.trim()) updateRoom({ name: e.target.value }); }} /></label><div className="dimensions">{(["width", "depth", "x", "z"] as const).map((field) => <label key={field}>{field}<input aria-label={`Room ${field}`} type="number" min={field === "width" || field === "depth" ? 1 : undefined} step=".5" value={selectedRoom[field]} onChange={(e) => updateRoom({ [field]: snap(Number(e.target.value)) })} /></label>)}</div><p className="hint">Moving a room also moves its furniture. Resizing must leave space for every piece.</p></>}
          <button className="text-button danger" onClick={() => { if (home && selectedId) commit(removeEntity(home, selectedId)); setSelectedId(null); }}><Icon name="trash" size={15} />Remove {selectedRoom ? "room & contents" : selectedOpening ? "opening" : "piece"}</button>
        </section>}
      </div><footer className="panel-footer"><span className="status-dot" />{storageLabel}<button onClick={() => { if (home) download(new Blob([JSON.stringify(home, null, 2)], { type: "application/json" }), "roomtone-home.json"); }} aria-label="Export home"><Icon name="download" size={16} /></button></footer>
    </aside>
    {displayNotice && <div className={`toast${displayNotice.error ? " toast-error" : ""}`} role={displayNotice.error ? "alert" : "status"}>{displayNotice.text}<button aria-label="Dismiss notification" onClick={() => { setNotice(null); storageDispatch({ type: "clear" }); }}><Icon name="close" size={16} /></button></div>}
    <dialog ref={modalRef} className="modal" onCancel={() => setModal(null)} onClick={(event) => { if (event.target === modalRef.current) setModal(null); }}><div className="modal-inner"><button className="modal-close icon-button" aria-label="Close dialog" onClick={() => setModal(null)}><Icon name="close" /></button>
      {modal === "plans" && <><span className="eyebrow">A NEW BEGINNING</span><h2>Every home starts somewhere.</h2><p>Pick a starting point. You can make it your own from here.</p><div className="plan-grid">{PLAN_NAMES.map((plan, index) => <button key={plan} className="plan-card" onClick={() => transact(() => setPlan(plan))}><svg viewBox="0 0 120 90" aria-hidden="true"><rect x="12" y="8" width="96" height="74" rx="4" fill="#e2e4d6" />{index > 0 && <g fill="#f5ecda" stroke="#a89d88" strokeWidth="3"><rect x="28" y="22" width="64" height="48" /><path d={index === 1 ? "M72 22v24h20" : index === 4 ? "M48 42h24v28M28 42h64" : "M56 22v48M28 48h28M56 39h36"} /></g>}</svg><strong>{plan}</strong><span>{index === 0 ? "Let your imagination lead" : index === 5 ? "Two floors, more possibilities" : ["", "Small space, big potential", "A cozy place to settle in", "Room for everyone", "Bring the outside in"][index]}</span></button>)}</div></>}
      {modal === "saves" && <><span className="eyebrow">YOUR LITTLE COLLECTION</span><h2>Homes worth coming back to.</h2><p>Saved in this browser. Export a file to move a home between devices.</p><div className="library-actions"><button className="primary-button" onClick={saveHome}><Icon name="save" size={17} />Save current home</button><button className="choice" onClick={() => importRef.current?.click()}>Import a home</button></div>{saves.length === 0 && <p className="empty-state">Your library is waiting for its first home.</p>}<div className="saved-list">{saves.map((saved) => <article key={saved.id}><div><strong>{saved.home.name}</strong><span>{saved.home.rooms.length} rooms · {new Date(saved.savedAt).toLocaleDateString()}</span></div><button className="choice" onClick={() => { commit(clone(saved.home)); setView(defaultView); setTool(selectTool); setSelectedId(null); setModal(null); notify("Home restored. Undo returns to your previous design."); }}>Open</button><button className="icon-button" aria-label={`Delete saved ${saved.home.name}`} onClick={() => transact(() => { const next = saves.filter((s) => s.id !== saved.id); localStorage.setItem(SAVES_KEY, JSON.stringify(next)); setSaves(next); })}><Icon name="trash" size={17} /></button></article>)}</div></>}
      {modal === "help" && <><span className="eyebrow">WELCOME TO ROOMTONE</span><h2>A home, at your own pace.</h2><p>An original, relaxing home builder inspired by <a href="https://github.com/madebysourasith-sudo/roomtone/" target="_blank" rel="noreferrer">Roomtone</a>. Everything is built from procedural 3D shapes. No external assets or accounts needed.</p><div className="help-grid"><div><strong>Build & furnish</strong><p>Draw rooms in Layout. Choose furniture and click to place. Click a piece to select; drag to move. Edit room sizes and positions in the panel.</p></div><div><strong>Make it yours</strong><p>Style floors and walls. Plant a garden in Decorate. Switch upstairs, add rooms and stairs, or show the roof.</p></div><div><strong>Find your angle</strong><p>Right-drag to orbit, scroll to zoom, Shift-drag to pan. On touchscreens use two fingers to orbit and pinch to zoom. Double-click a floor to focus a room.</p></div><div><strong>A few shortcuts</strong><p><kbd>R</kbd> rotate · <kbd>Esc</kbd> cancel<br /><kbd>⌘ / Ctrl Z</kbd> undo · <kbd>Shift Z</kbd> redo<br /><kbd>Delete</kbd> remove selection</p></div><div><strong>Keep your home</strong><p>Changes autosave on this device. Use Save for named copies, or Export for a portable JSON file. Snapshots capture the 3D scene.</p></div><div><strong>Built to breathe</strong><p>Next.js 16.4.4 + Three.js 0.187.0. Demand rendering, cached geometry and bounded pixel density keep the GPU quiet while you pause.</p></div></div></>}
    </div></dialog>
    <input className="visually-hidden" ref={importRef} type="file" accept=".json,application/json" aria-label="Import home file" onChange={async (e) => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error("Home files must be smaller than 2 MB.");
        const imported = parseHome(JSON.parse(await file.text()));
        autosaveBlocked.current = false; commit(imported); setView(defaultView); setTool(selectTool); setSelectedId(null); setModal(null); notify("Your home is ready.");
      } catch (error) { notify(`Import failed: ${errorMessage(error)}`, true); }
    }} />
  </main>;
}
