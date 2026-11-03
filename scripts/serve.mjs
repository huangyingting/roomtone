import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const root = resolve("out");
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain", ".wasm": "application/wasm", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".ktx2": "image/ktx2", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf" };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
    if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) { response.writeHead(404).end("Not found"); return; }
    let file = resolve(root, `.${pathname.slice(basePath.length) || "/"}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(403).end("Forbidden"); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    const extension = file.slice(file.lastIndexOf("."));
    response.writeHead(200, { "Content-Type": types[extension] || "application/octet-stream", "Cache-Control": "no-cache" });
    response.end(await readFile(file));
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") { response.writeHead(404).end("Not found"); return; }
    console.error("Static server request failed:", error);
    response.writeHead(500).end("Server error");
  }
}).listen(port, "127.0.0.1", () => console.log(`Roomtone static export: http://127.0.0.1:${port}${basePath}/`));
