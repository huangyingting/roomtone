"use client";

import { useEffect, useState } from "react";

export default function OriginalRoomtone({ markup }: { markup: string }) {
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    document.body.setAttribute("aria-busy", "true");
    import("@/original/roomtone.js").then(async ({ startRoomtone }) => {
      if (controller.signal.aborted) return;
      dispose = await startRoomtone({ signal: controller.signal, assetBase: process.env.NEXT_PUBLIC_BASE_PATH || "" });
      if (controller.signal.aborted) dispose?.();
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      controller.abort();
      document.body.removeAttribute("aria-busy");
      setError(failure instanceof Error ? failure.message : "The 3D view could not be opened.");
    });
    return () => { controller.abort(); dispose?.(); };
  }, []);
  return <>
    <div dangerouslySetInnerHTML={{ __html: markup }} suppressHydrationWarning />
    {error && <div role="alert" style={{ position: "fixed", zIndex: 10001, inset: 0, display: "grid", placeContent: "center", padding: 32, background: "#e9e4db" }}>
      <h1>Roomtone could not start</h1><p>{error}</p><p>Enable WebGL and hardware acceleration, then reload. Your original browser saves are unchanged.</p>
    </div>}
  </>;
}
