import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "dist");
const indexHtml = path.join(distDir, "index.html");
const notFoundHtml = path.join(distDir, "404.html");

if (!fs.existsSync(indexHtml)) {
  console.error("[copy-404] dist/index.html not found. Did you run vite build?");
  process.exit(1);
}

fs.copyFileSync(indexHtml, notFoundHtml);
console.log("[copy-404] Created dist/404.html");
