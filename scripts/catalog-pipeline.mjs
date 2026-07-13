// Catalog pipeline
// 1. Discovers every GLB/glTF under public/models
// 2. Renders each in a headless browser (src/thumbnail.tsx) and screenshots it
// 3. Regenerates src/catalog.models.ts with one FurnitureItem per model
//
// Usage: npm run catalog   (after `npm install` pulls puppeteer)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MODELS_DIR = path.join(ROOT, "public", "models");
const PORT = 5179;

// folder name under public/models -> catalog category label
const CATEGORY_MAP = {
  sofas: "Sofas",
  chairs: "Chairs",
  tables: "Tables",
  cabinets: "Cabinets",
};

// --- 1. discover models -------------------------------------------------
function isModelFile(name) {
  return /\.(glb|gltf)$/i.test(name);
}

function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "textures") continue; // skip texture sets
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, rel));
    else if (isModelFile(entry.name)) out.push(rel);
  }
  return out;
}

function titleCase(slug) {
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function describe(relPath) {
  const parts = relPath.split(path.sep);
  const categoryFolder = parts[0];
  const file = parts[parts.length - 1];
  const category = CATEGORY_MAP[categoryFolder.toLowerCase()] ?? titleCase(categoryFolder);

  // assetId / label: prefer the containing sub-folder for glTF sets,
  // otherwise the bare file name (e.g. sofa.glb).
  let id;
  if (parts.length === 2) {
    id = path.basename(file, path.extname(file));
  } else {
    const parent = parts[parts.length - 2];
    id = parent.replace(/\.gltf$/i, "");
  }

  const label = titleCase(id);
  const url = "/models/" + relPath.split(path.sep).join("/");

  const modelDir = parts.slice(0, -1).join(path.sep);
  const thumbRel = path.join(modelDir, `${id}_thumb.png`);
  const picture = "/models/" + thumbRel.split(path.sep).join("/");
  const thumbFull = path.join(MODELS_DIR, thumbRel);

  return { category, assetId: id, label, url, picture, thumbFull };
}

// --- 2. dev server -----------------------------------------------------
async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite dev server did not start in time");
}

// --- 3. run ------------------------------------------------------------
async function main() {
  const models = walk(MODELS_DIR);
  console.log(`Discovered ${models.length} model(s).`);

  const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: "ignore",
  });

  let browser;
  try {
    await waitForServer();
    const puppeteer = (await import("puppeteer")).default;
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });

    const byCategory = {};
    const usedIds = new Set();

    for (const relPath of models) {
      const item = describe(relPath);
      // guarantee globally-unique assetId
      let assetId = item.assetId;
      let n = 2;
      while (usedIds.has(assetId)) assetId = `${item.assetId}${n++}`;
      usedIds.add(assetId);
      item.assetId = assetId;

      console.log(`Screenshotting ${item.label} (${item.url})`);
      const target = `http://localhost:${PORT}/thumbnail.html?model=${encodeURIComponent(item.url)}`;
      try {
        await page.goto(target, { waitUntil: "networkidle0", timeout: 60000 });
        await page.waitForFunction("window.__ready === true", { timeout: 60000 });
        fs.mkdirSync(path.dirname(item.thumbFull), { recursive: true });
        await page.screenshot({ path: item.thumbFull });
      } catch (err) {
        console.warn(`  ! failed to render ${item.url}: ${err.message}`);
        item.picture = ""; // leave placeholder so the catalog still satisfies its fields
      }

      (byCategory[item.category] ??= []).push({
        kind: "furniture",
        label: item.label,
        assetId: item.assetId,
        url: item.url,
        picture: item.picture,
      });
    }

    writeCatalog(byCategory);
    console.log("Wrote src/catalog.models.ts");
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
}

function writeCatalog(byCategory) {
  const order = ["Sofas", "Chairs", "Tables", "Cabinets"];
  const categories = Object.keys(byCategory).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const lines = ['import type { FurnitureItem } from "./catalog";', ""];
  lines.push("// AUTO-GENERATED by scripts/catalog-pipeline.mjs");
  lines.push('// Do not edit by hand. To (re)generate: `npm run catalog`');
  lines.push("export const CATALOG_FURNITURE: Record<string, FurnitureItem[]> = {");
  categories.forEach((category, ci) => {
    lines.push(`  ${JSON.stringify(category)}: [`);
    byCategory[category].forEach((item, ii) => {
      const comma = ii === byCategory[category].length - 1 ? "" : ",";
      lines.push("    {");
      lines.push('      kind: "furniture",');
      lines.push(`      label: ${JSON.stringify(item.label)},`);
      lines.push(`      assetId: ${JSON.stringify(item.assetId)},`);
      lines.push(`      url: ${JSON.stringify(item.url)},`);
      lines.push(`      picture: ${JSON.stringify(item.picture)},`);
      lines.push(`    }${comma}`);
    });
    const catTrailing = ci === categories.length - 1 ? "" : ",";
    lines.push(`  ]${catTrailing}`);
  });
  lines.push("};");
  lines.push("");

  fs.writeFileSync(path.join(ROOT, "src", "catalog.models.ts"), lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
