// Catalog pipeline
// 1. Discovers every GLB/glTF under public/models
// 2. Renders each in a headless browser (src/thumbnail.tsx) and screenshots it
// 3. Regenerates src/catalog.models.ts with one FurnitureItem per model
//
// Usage: npm run catalog   (after `npm install` pulls puppeteer)
import "dotenv/config"
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
import { enrich } from "./enrich.mjs";


console.log("key:", typeof process.env.GROQ_API_KEY);
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
  beds:"Beds"
};

// Real-world target heights (metres) per category. Heights cluster tightly in
// reality (seat/counter heights), so we normalize on height only — never width,
// or a loveseat and a 3-seater would end up identical.
const TARGET_HEIGHT_M = {
  Sofas: 0.85,
  Chairs: 0.9,
  Tables: 0.45,
  Cabinets: 0.9,
};

// Beds normalize on footprint LENGTH, not height — a queen mattress is always
// ~2.03m long regardless of how tall its headboard is, and headboard height
// varies widely between models. Scaling on total bbox height squashes the
// frame/mattress under the headboard's budget.
const TARGET_LENGTH_M = {
  Beds: 2.03, // queen mattress length, most common asset size
};

// Measure a model's height (y extent) and bbox min-Y in its OWN units via
// gltf-transform (lightweight, no headless three.js needed). Returns null on
// any failure so a bad import falls back to scale 1 / offset 0.
async function getBoundsInfo(modelPath) {
  const io = new NodeIO();
  const doc = await io.read(modelPath);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) return null;
  const { min, max } = getBounds(scene);
  const height = max[1] - min[1];
  const length = Math.max(max[0] - min[0], max[2] - min[2]); // longest horizontal axis
  if (!Number.isFinite(height) || height <= 0) return null;
  return { height, minY: min[1], length };
}

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

      // Normalize asset size + ground it. Measure real height and bbox min-Y,
      // scale to the category target, and compute a Y offset that lifts the
      // bounding-box bottom onto the floor. Leave undefined if unmeasurable.
      let scale, groundOffset;
      try {
        const modelPath = path.join(MODELS_DIR, relPath);
        const info = await getBoundsInfo(modelPath);
        if (info) {
          if (item.category === "Beds") {
            scale = +(TARGET_LENGTH_M.Beds / info.length).toFixed(4);
          } else {
            const target = TARGET_HEIGHT_M[item.category];
            if (target) scale = +(target / info.height).toFixed(4);
          }
          if (scale != null) {
            // bottom of bbox is at minY (model units); after scaling by
            // `scale` it sits at minY*scale, so lift by -minY*scale to land on y=0.
            groundOffset = +(-info.minY * scale).toFixed(4);
          }
          const metric = item.category === "Beds" ? `length ${info.length.toFixed(3)}` : `height ${info.height.toFixed(3)}`;
          console.log(`  bounds: raw ${metric} minY ${info.minY.toFixed(3)} -> scale ${scale}, groundOffset ${groundOffset}`);
        }
      } catch (err) {
        console.warn(`  ! bounds failed for ${item.url}: ${err.message}`);
      }
      item.scale = scale;
      item.groundOffset = groundOffset;

      console.log(`Screenshotting ${item.label} (${item.url})`);
      const target = `http://localhost:${PORT}/thumbnail.html?model=${encodeURIComponent(item.url)}`;
      try {
        // Thumbnail cache: if a non-empty PNG already exists, reuse it and skip
        // the headless render entirely. To force a re-render after editing a GLB,
        // delete its `<id>_thumb.png`.
        if (fs.existsSync(item.thumbFull) && fs.statSync(item.thumbFull).size > 0) {
          console.warn("  (cached thumbnail)");
        } else {
          await page.goto(target, { waitUntil: "networkidle0", timeout: 60000 });
          await page.waitForFunction("window.__ready === true", { timeout: 60000 });
          fs.mkdirSync(path.dirname(item.thumbFull), { recursive: true });
          await page.screenshot({ path: item.thumbFull });
        }
      } catch (err) {
        console.warn(`  ! failed to render ${item.url}: ${err.message}`);
        item.picture = ""; // leave placeholder so the catalog still satisfies its fields
      }

      // Vision enrichment — best-effort, never fails the build.
      // Pass assetId so the cache key is stable across re-runs.
      const e = await enrich(item.thumbFull, item.assetId);
      if (e) Object.assign(item, e);

      (byCategory[item.category] ??= []).push({
        kind: "furniture",
        label: item.label,
        assetId: item.assetId,
        url: item.url,
        picture: item.picture,
        ...(item.scale != null ? { scale: item.scale } : {}),
        ...(item.groundOffset != null ? { groundOffset: item.groundOffset } : {}),
        ...(item.style != null ? { style: item.style } : {}),
        ...(item.material != null ? { material: item.material } : {}),
        ...(item.palette != null ? { palette: item.palette } : {}),
        ...(item.tags != null ? { tags: item.tags } : {}),
        ...(item.room != null ? { room: item.room } : {}),
        ...(item.mood != null ? { mood: item.mood } : {}),
        ...(item.seats != null ? { seats: item.seats } : {}),
        ...(item.description != null ? { description: item.description } : {}),
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
  const order = ["Sofas", "Chairs", "Tables", "Cabinets", "Beds"];
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
      if (item.scale != null) {
        lines.push(`      scale: ${JSON.stringify(item.scale)},`);
      }
      if (item.groundOffset != null) {
        lines.push(`      groundOffset: ${JSON.stringify(item.groundOffset)},`);
      }
      if (item.style != null) {
        lines.push(`      style: ${JSON.stringify(item.style)},`);
      }
      if (item.material != null) {
        lines.push(`      material: ${JSON.stringify(item.material)},`);
      }
      if (item.palette != null) {
        lines.push(`      palette: ${JSON.stringify(item.palette)},`);
      }
      if (item.tags != null) {
        lines.push(`      tags: ${JSON.stringify(item.tags)},`);
      }
      if (item.room != null) {
        lines.push(`      room: ${JSON.stringify(item.room)},`);
      }
      if (item.mood != null) {
        lines.push(`      mood: ${JSON.stringify(item.mood)},`);
      }
      if (item.seats != null) {
        lines.push(`      seats: ${item.seats},`);
      }
      if (item.description != null) {
        lines.push(`      description: ${JSON.stringify(item.description)},`);
      }
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
