"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CATALOG_BY_ID } from "../lib/catalog";
import { LOT, snap, type Point, type SceneProps } from "../lib/model";
import { MeshResources, buildWorld, createPieceMesh, hitEntity, nightAmount, type BuiltWorld } from "../lib/meshes";

interface Runtime { update: (props: SceneProps) => void }
interface Gesture {
  pointerId: number; startX: number; startY: number; moved: boolean; cancelled: boolean;
  start: Point; current: Point; id: string | null; origin: Point | null; kind: SceneProps["tool"]["kind"];
}

const CLICK_DISTANCE = 5;
const insideLot = (point: Point) => point.x >= LOT.minX && point.x <= LOT.maxX && point.z >= LOT.minZ && point.z <= LOT.maxZ;
const snapped = (point: Point): Point => ({ x: snap(point.x), z: snap(point.z) });
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function SceneCanvas(props: SceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  const runtime = useRef<Runtime | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current;
    if (!host || !canvas) return;
    canvas.dataset.frames = "0"; canvas.dataset.drawCalls = "0"; canvas.dataset.triangles = "0";
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch (error) {
      latest.current.onError(`WebGL is unavailable. Enable hardware acceleration or try a WebGL 2 compatible browser. ${message(error)}`);
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;

    const resources = new MeshResources();
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-18, 18, 12, -12, 0.1, 180);
    camera.position.set(-18, 17 + latest.current.view.floor * 3, 22);
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, latest.current.view.floor * 3 + 0.8, 0);
    controls.enableDamping = false;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.minPolarAngle = Math.PI / 7;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minZoom = 0.45; controls.maxZoom = 5;
    controls.zoomSpeed = 0.85; controls.rotateSpeed = 0.75; controls.panSpeed = 0.85;
    controls.screenSpacePanning = true;
    controls.update();

    const ambient = new THREE.HemisphereLight("#fff4d8", "#76845c", 2);
    const sun = new THREE.DirectionalLight("#fff1d3", 3);
    sun.position.set(-8, 18, 10);
    sun.castShadow = true;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -17;
    sun.shadow.camera.right = sun.shadow.camera.top = 17;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 55;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.035;
    sun.shadow.mapSize.set(2048, 2048);
    const fill = new THREE.DirectionalLight("#d6e3e0", 0.4);
    fill.position.set(8, 10, -8);
    scene.add(ambient, sun, sun.target, fill);
    const overlay = new THREE.Group();
    scene.add(overlay);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.08);
    const intersection = new THREE.Vector3();
    const activePointers = new Set<number>();
    let current = latest.current;
    let world: BuiltWorld | null = null;
    let frame: number | null = null;
    let frames = 0, width = 0, height = 0;
    let disposed = false, contextLost = false, faulted = false;
    let gesture: Gesture | null = null;
    let hover: Point | null = null;
    let pointerScreen: { clientX: number; clientY: number } | null = null;
    let lastClick: { x: number; y: number; time: number; touch: boolean } | null = null;
    let ghost: THREE.Group | null = null;
    let ghostKey = "";
    let outline: THREE.BoxHelper | null = null;
    let rectangle: THREE.Group | null = null;
    let previousFloor = current.view.floor;
    let previousFocus: string | null = null;
    const ghostMaterial = new THREE.MeshStandardMaterial({
      color: "#a6c7b2", emissive: "#62856b", emissiveIntensity: 0.25,
      transparent: true, opacity: 0.44, roughness: 0.8, depthWrite: false,
    });
    const rectangleFill = new THREE.MeshBasicMaterial({
      color: "#83a383", transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide,
    });
    const rectangleLine = new THREE.LineBasicMaterial({ color: "#527765", depthTest: false });
    const rectangleGeometry = new THREE.BufferGeometry();
    rectangleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(15), 3));

    function renderFrame() {
      if (disposed || contextLost || faulted || document.hidden || !width || !height || !world) return;
      try {
        renderer.render(scene, camera);
        frames++;
        canvas!.dataset.frames = String(frames);
        canvas!.dataset.drawCalls = String(renderer.info.render.calls);
        canvas!.dataset.triangles = String(renderer.info.render.triangles);
        canvas!.dataset.dpr = String(renderer.getPixelRatio());
        if (!ready.current) { ready.current = true; latest.current.onReady(); }
      } catch (error) {
        faulted = true;
        latest.current.onError(`The 3D view could not render: ${message(error)}`);
      }
    }

    function invalidate() {
      if (disposed || contextLost || faulted || document.hidden || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        renderFrame();
      });
    }

    function capture() {
      if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
      // toBlob follows this synchronous event in the same task, before the drawing buffer is cleared.
      renderFrame();
    }

    function pixelRatio() {
      const quality = current.view.quality;
      const mobile = matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
      const cap = quality === "low" ? 1 : quality === "high" ? 2 : mobile ? 1.25 : 1.5;
      return Math.min(window.devicePixelRatio || 1, cap);
    }

    function resize() {
      if (disposed) return;
      const rect = host!.getBoundingClientRect();
      width = Math.round(rect.width); height = Math.round(rect.height);
      const dpr = pixelRatio();
      renderer.setPixelRatio(dpr);
      canvas!.dataset.dpr = String(dpr);
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const vertical = Math.max(23, 31 / aspect);
      camera.left = -vertical * aspect / 2; camera.right = vertical * aspect / 2;
      camera.top = vertical / 2; camera.bottom = -vertical / 2;
      camera.updateProjectionMatrix();
      if (pointerScreen && !activePointers.size) {
        hover = groundPoint(pointerScreen);
        if (current.tool.kind === "place") updateFeedback();
      }
      invalidate();
    }

    function clearOutline() {
      if (!outline) return;
      overlay.remove(outline);
      outline.geometry.dispose();
      if (Array.isArray(outline.material)) outline.material.forEach((material) => material.dispose());
      else outline.material.dispose();
      outline = null;
    }

    function clearGhost() {
      if (ghost) overlay.remove(ghost);
      ghost = null; ghostKey = "";
    }

    function hideFeedback() {
      if (ghost) ghost.visible = false;
      if (rectangle) rectangle.visible = false;
      invalidate();
    }

    function showRectangle(start: Point, end: Point) {
      if (!rectangle) {
        rectangle = new THREE.Group();
        const fill = new THREE.Mesh(resources.geometry("feedback-plane", () => new THREE.PlaneGeometry(1, 1)), rectangleFill);
        fill.rotation.x = -Math.PI / 2;
        fill.renderOrder = 4;
        const line = new THREE.Line(rectangleGeometry, rectangleLine);
        line.renderOrder = 5;
        rectangle.add(fill, line); overlay.add(rectangle);
      }
      const x = Math.min(start.x, end.x), z = Math.min(start.z, end.z);
      const w = Math.abs(end.x - start.x), d = Math.abs(end.z - start.z);
      rectangle.visible = true;
      rectangle.position.y = current.view.floor * 3 + 0.105;
      const fill = rectangle.children[0];
      fill.position.set(x + w / 2, 0, z + d / 2); fill.scale.set(w, d, 1);
      const positions = rectangleGeometry.getAttribute("position") as THREE.BufferAttribute;
      [[x, z], [x + w, z], [x + w, z + d], [x, z + d], [x, z]].forEach(([px, pz], i) => positions.setXYZ(i, px, 0.005, pz));
      positions.needsUpdate = true; rectangleGeometry.computeBoundingSphere();
    }

    function showGhost(point: Point, movingId?: string) {
      const piece = movingId ? current.home.pieces.find((p) => p.id === movingId) : null;
      const catalogId = piece?.catalogId ?? current.tool.catalogId;
      if (!catalogId || !CATALOG_BY_ID.has(catalogId)) { clearGhost(); return; }
      const rotation = piece?.rotation ?? current.tool.rotation;
      const scale = piece?.scale ?? 1;
      const key = `${catalogId}:${rotation}:${scale}:${current.view.floor}`;
      if (key !== ghostKey) {
        clearGhost();
        ghost = createPieceMesh({
          id: "placement-preview", catalogId, x: point.x, z: point.z, floor: current.view.floor,
          rotation, scale, color: "#a6c7b2",
        }, resources);
        ghost.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.material = ghostMaterial;
            object.castShadow = object.receiveShadow = false;
            object.renderOrder = 3;
          }
        });
        overlay.add(ghost); ghostKey = key;
      }
      if (ghost) {
        ghost.visible = true;
        const garden = CATALOG_BY_ID.get(catalogId)?.category === "Garden";
        ghost.position.set(point.x, current.view.floor * 3 + (garden ? 0 : 0.08), point.z);
        ghost.updateMatrixWorld(true);
      }
    }

    function updateFeedback() {
      if (rectangle) rectangle.visible = false;
      if (ghost) ghost.visible = false;
      if (gesture && !gesture.cancelled && gesture.moved) {
        if (gesture.kind === "room") showRectangle(snapped(gesture.start), snapped(gesture.current));
        else if (gesture.kind === "select" && gesture.id && gesture.origin) {
          const moved = snapped({
            x: gesture.origin.x + gesture.current.x - gesture.start.x,
            z: gesture.origin.z + gesture.current.z - gesture.start.z,
          });
          const room = current.home.rooms.find((room) => room.id === gesture!.id);
          if (room) showRectangle(moved, { x: moved.x + room.width, z: moved.z + room.depth });
          else showGhost(moved, gesture.id);
        }
      } else if (hover && insideLot(hover) && current.tool.kind === "place" && activePointers.size < 2) {
        showGhost(snapped(hover));
      }
      invalidate();
    }

    function updateOutline() {
      clearOutline();
      const entity = current.selectedId ? world?.entities.get(current.selectedId) : null;
      if (entity) {
        outline = new THREE.BoxHelper(entity, "#b98446");
        outline.renderOrder = 6;
        if (!Array.isArray(outline.material)) {
          outline.material.depthTest = false;
          outline.material.transparent = true;
          outline.material.opacity = 0.9;
        }
        overlay.add(outline);
      }
      invalidate();
    }

    function rebuild() {
      // Build first; a failed procedural finish must not leave a half-built visible world.
      const next = buildWorld(current.home, current.view, resources);
      if (world) { scene.remove(world.group); world.dispose(); }
      world = next; scene.add(next.group);
      const night = nightAmount(current.view.time);
      scene.background = new THREE.Color("#ebe2d4").lerp(new THREE.Color("#2a3b49"), night);
      ambient.color.set("#fff4dd").lerp(new THREE.Color("#a6bfd5"), night);
      ambient.intensity = 2.15 - night * 1.25;
      sun.color.set("#fff0d0").lerp(new THREE.Color("#bbd3e6"), night);
      sun.intensity = 3.2 - night * 2.8;
      fill.intensity = 0.45 + night * 0.12;
      renderer.toneMappingExposure = 1.05 + night * 0.18;
      const mapSize = current.view.quality === "low" ? 1024 : 2048;
      if (sun.shadow.mapSize.x !== mapSize) {
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        sun.shadow.mapSize.set(mapSize, mapSize);
      }
      renderer.shadowMap.needsUpdate = true;
      plane.constant = -(current.view.floor * 3 + 0.08);
      if (previousFloor !== current.view.floor && !current.view.focusRoomId) {
        const delta = (current.view.floor - previousFloor) * 3;
        controls.target.y += delta; camera.position.y += delta;
      }
      if (previousFocus !== current.view.focusRoomId) {
        const room = current.home.rooms.find((room) => room.id === current.view.focusRoomId);
        const target = room ? new THREE.Vector3(room.x + room.width / 2, room.floor * 3 + 0.8, room.z + room.depth / 2) : new THREE.Vector3(0, current.view.floor * 3 + 0.8, 0);
        camera.position.add(target.clone().sub(controls.target));
        controls.target.copy(target);
        camera.zoom = room ? Math.min(3.5, Math.max(1, 13 / Math.max(room.width, room.depth))) : 1;
        camera.updateProjectionMatrix();
      }
      previousFloor = current.view.floor; previousFocus = current.view.focusRoomId;
      controls.update();
      updateOutline(); updateFeedback(); invalidate();
    }

    function setRay(event: { clientX: number; clientY: number }): boolean {
      const bounds = canvas!.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return false;
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      camera.updateMatrixWorld();
      raycaster.setFromCamera(pointer, camera);
      return true;
    }

    function groundPoint(event: { clientX: number; clientY: number }): Point | null {
      if (!setRay(event) || !raycaster.ray.intersectPlane(plane, intersection)) return null;
      return { x: intersection.x, z: intersection.z };
    }

    function pick(event: { clientX: number; clientY: number }) {
      if (!world || !setRay(event)) return null;
      for (const hit of raycaster.intersectObject(world.group, true)) {
        const id = hitEntity(hit);
        if (!id) continue;
        const room = current.home.rooms.find((room) => room.id === id);
        const piece = current.home.pieces.find((piece) => piece.id === id);
        const opening = current.home.openings.find((opening) => opening.id === id);
        const floor = room?.floor ?? piece?.floor ?? current.home.rooms.find((room) => room.id === opening?.roomId)?.floor;
        if (floor === current.view.floor) return { id, point: { x: hit.point.x, z: hit.point.z } };
      }
      return null;
    }

    function focusAt(event: { clientX: number; clientY: number }) {
      const hit = pick(event), point = groundPoint(event);
      if (!point) return;
      const opening = current.home.openings.find((opening) => opening.id === hit?.id);
      const piece = current.home.pieces.find((piece) => piece.id === hit?.id);
      const room = current.home.rooms.find((room) => room.id === (opening?.roomId ?? hit?.id)) ??
        current.home.rooms.find((room) => room.floor === current.view.floor && (piece?.x ?? point.x) >= room.x && (piece?.x ?? point.x) <= room.x + room.width && (piece?.z ?? point.z) >= room.z && (piece?.z ?? point.z) <= room.z + room.depth);
      if (room && world?.entities.has(room.id)) latest.current.onAction({ type: "focus", id: room.id, point });
    }

    function pointerDown(event: PointerEvent) {
      if (faulted || contextLost) return;
      activePointers.add(event.pointerId);
      if (event.pointerType !== "touch") {
        // OrbitControls swaps ROTATE to PAN when a modifier is held.
        controls.mouseButtons.LEFT = event.shiftKey ? THREE.MOUSE.ROTATE : null;
        controls.mouseButtons.MIDDLE = event.shiftKey || event.ctrlKey || event.metaKey ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
      }
      if (activePointers.size > 1) {
        if (gesture) gesture.cancelled = true;
        lastClick = null; hover = null; pointerScreen = null; hideFeedback();
        return;
      }
      if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) {
        gesture = null; lastClick = null; hover = null; pointerScreen = null; hideFeedback();
        return;
      }
      const point = groundPoint(event);
      if (!point) return;
      canvas!.focus({ preventScroll: true });
      const hit = pick(event);
      const piece = current.home.pieces.find((piece) => piece.id === hit?.id && piece.floor === current.view.floor);
      const room = current.home.rooms.find((room) => room.id === hit?.id && room.floor === current.view.floor);
      const movable = hit?.id === current.selectedId && current.tool.kind === "select" ? piece ?? room : null;
      gesture = {
        pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, start: point, current: point,
        moved: false, cancelled: false, id: hit?.id ?? null,
        origin: movable ? { x: movable.x, z: movable.z } : null, kind: current.tool.kind,
      };
      // Capture keeps a room/furniture drag reliable when the pointer leaves the canvas.
      canvas!.setPointerCapture(event.pointerId);
      hover = point; pointerScreen = { clientX: event.clientX, clientY: event.clientY }; updateFeedback();
    }

    function pointerMove(event: PointerEvent) {
      if (disposed || contextLost || faulted) return;
      if (activePointers.size > 1) return;
      pointerScreen = { clientX: event.clientX, clientY: event.clientY };
      const point = groundPoint(event);
      if (gesture && gesture.pointerId === event.pointerId) {
        if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > CLICK_DISTANCE) gesture.moved = true;
        if (point) gesture.current = point;
      }
      if (event.buttons && !gesture) { hover = null; pointerScreen = null; hideFeedback(); return; }
      hover = point;
      if (current.tool.kind === "place" || current.tool.kind === "room" || (gesture?.origin && gesture.moved)) updateFeedback();
    }

    function pointerUp(event: PointerEvent) {
      activePointers.delete(event.pointerId);
      if (activePointers.size === 0) controls.mouseButtons.LEFT = null;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const drag = gesture;
      const point = groundPoint(event) ?? drag.current;
      drag.current = point;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > CLICK_DISTANCE) drag.moved = true;
      gesture = null;
      if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
      hover = event.pointerType === "touch" ? null : point;
      pointerScreen = event.pointerType === "touch" ? null : { clientX: event.clientX, clientY: event.clientY };
      if (drag.cancelled || event.type === "pointercancel" || current.tool.kind !== drag.kind || contextLost || faulted) {
        lastClick = null; updateFeedback(); return;
      }
      if (drag.moved) {
        lastClick = null;
        if (drag.kind === "room") {
          const start = snapped(drag.start), end = snapped(point);
          latest.current.onAction({
            type: "drawRoom", point: { x: Math.min(start.x, end.x), z: Math.min(start.z, end.z) },
            endPoint: { x: Math.max(start.x, end.x), z: Math.max(start.z, end.z) },
          });
        } else if (drag.kind === "select" && drag.id && drag.origin) {
          latest.current.onAction({
            type: "move", id: drag.id,
            point: snapped({ x: drag.origin.x + point.x - drag.start.x, z: drag.origin.z + point.z - drag.start.z }),
          });
        }
      } else {
        const hit = pick(event);
        const action = drag.kind;
        if (action === "select" || action === "paint" || action === "erase") latest.current.onAction({ type: action, id: hit?.id ?? null, point: hit?.point ?? point });
        else if (action === "place") latest.current.onAction({ type: "place", point: snapped(point) });
        else if (action === "opening") latest.current.onAction({ type: "opening", point: hit?.point ?? point });
        const now = performance.now();
        if (event.pointerType === "touch" && action === "select" && lastClick?.touch && now - lastClick.time < 350 && Math.hypot(event.clientX - lastClick.x, event.clientY - lastClick.y) < 20) {
          focusAt(event); lastClick = null;
        } else lastClick = { x: event.clientX, y: event.clientY, time: now, touch: event.pointerType === "touch" };
      }
      updateFeedback();
    }

    function doubleClick(event: MouseEvent) {
      if (current.tool.kind !== "select" || event.button !== 0 || event.shiftKey || activePointers.size || !lastClick || lastClick.touch || performance.now() - lastClick.time > 450) return;
      if (Math.hypot(event.clientX - lastClick.x, event.clientY - lastClick.y) <= CLICK_DISTANCE) focusAt(event);
    }

    function pointerLeave() {
      if (!gesture) { hover = null; pointerScreen = null; hideFeedback(); }
    }

    function cancelGesture() {
      if (gesture) {
        gesture.cancelled = true;
        if (canvas!.hasPointerCapture(gesture.pointerId)) canvas!.releasePointerCapture(gesture.pointerId);
      }
      gesture = null; hover = null; pointerScreen = null; lastClick = null; activePointers.clear(); hideFeedback();
    }

    function controlsChange() {
      if (activePointers.size > 1 || (activePointers.size && !gesture)) { hover = null; hideFeedback(); }
      else if (pointerScreen && !activePointers.size && current.tool.kind === "place") {
        hover = groundPoint(pointerScreen); updateFeedback();
      }
      invalidate();
    }

    function visibilityChange() {
      if (document.hidden) {
        cancelGesture();
        if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
      } else { resize(); invalidate(); }
    }

    function lost(event: Event) {
      event.preventDefault();
      contextLost = true; cancelGesture();
      if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
      latest.current.onError("The WebGL graphics context was lost. The view will resume if the browser restores it; otherwise reload the page.");
    }

    function restored() {
      contextLost = false; faulted = false;
      renderer.shadowMap.needsUpdate = true;
      resize(); invalidate();
    }

    // Capture listeners run before OrbitControls, letting two fingers cancel editing without blocking orbit.
    canvas.addEventListener("pointerdown", pointerDown, true);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("pointerleave", pointerLeave);
    canvas.addEventListener("dblclick", doubleClick);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    canvas.addEventListener("roomtone-capture", capture);
    window.addEventListener("blur", cancelGesture);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibilityChange);
    controls.addEventListener("change", controlsChange);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    runtime.current = {
      update(next) {
        const viewChanged = next.view.floor !== current.view.floor || next.view.roof !== current.view.roof ||
          next.view.grid !== current.view.grid || next.view.time !== current.view.time ||
          next.view.quality !== current.view.quality || next.view.focusRoomId !== current.view.focusRoomId;
        const rebuildWorld = next.home !== current.home || viewChanged;
        const selectionChanged = next.selectedId !== current.selectedId;
        const toolChanged = next.tool.kind !== current.tool.kind || next.tool.catalogId !== current.tool.catalogId ||
          next.tool.rotation !== current.tool.rotation;
        const screen = pointerScreen;
        current = next;
        if (rebuildWorld || toolChanged || (selectionChanged && gesture)) cancelGesture();
        if (toolChanged) clearGhost();
        if (screen && current.tool.kind === "place") {
          pointerScreen = screen;
          hover = groundPoint(screen);
        }
        if (rebuildWorld) faulted = false;
        else if (faulted) return;
        try {
          if (rebuildWorld) { rebuild(); resize(); }
          else {
            if (selectionChanged) updateOutline();
            if (toolChanged) updateFeedback();
          }
          canvas!.style.cursor = current.tool.kind === "select" ? "default" : "crosshair";
          invalidate();
        } catch (error) {
          faulted = true;
          latest.current.onError(`The 3D home could not be built: ${message(error)}`);
        }
      },
    };
    try {
      rebuild(); resize();
      canvas.style.cursor = current.tool.kind === "select" ? "default" : "crosshair";
    } catch (error) {
      faulted = true;
      latest.current.onError(`The 3D home could not be built: ${message(error)}`);
    }
    return () => {
      disposed = true; runtime.current = null;
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown, true);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("pointerleave", pointerLeave);
      canvas.removeEventListener("dblclick", doubleClick);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      canvas.removeEventListener("roomtone-capture", capture);
      window.removeEventListener("blur", cancelGesture);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibilityChange);
      controls.removeEventListener("change", controlsChange);
      controls.dispose();
      clearOutline(); clearGhost();
      world?.dispose();
      ghostMaterial.dispose(); rectangleFill.dispose(); rectangleLine.dispose(); rectangleGeometry.dispose();
      resources.dispose();
      sun.shadow.map?.dispose(); sun.shadow.mapPass?.dispose();
      scene.clear(); renderer.dispose();
    };
  }, []);

  useEffect(() => {
    latest.current = props;
    runtime.current?.update(props);
  }, [props]);

  return (
    <div ref={hostRef} className="scene-host" style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        aria-label="3D home design canvas"
        data-testid="scene-canvas"
        role="img"
        tabIndex={0}
        style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
      >
        Interactive 3D home design. Use the editor controls to select, place, and arrange rooms and furniture.
      </canvas>
    </div>
  );
}
