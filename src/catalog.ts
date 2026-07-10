// The catalog is the single source of truth for what you can add to a scene.
// Items are one of two kinds; the sidebar branches on `kind` when you click.
type FurnitureItem = { kind: "furniture"; label: string; assetId: string; url: string };
type WallItem = { kind: "wall"; label: string };
type LightItem = {kind:"light" ;label:string; lightType:"point"|"spot"|"area"}
type CatalogItem = FurnitureItem | WallItem|LightItem;
type CatalogSection = { category: string; items: CatalogItem[] };

export const CATALOG: CatalogSection[] = [
  { category: "Sofas", items: [{ kind: "furniture", label: "Old Sofa", assetId: "sofa", url: "/sofa.glb" }] },
  { category: "Chairs", items: [] },
  { category: "Tables", items: [] },
  { category: "Structure", items: [{ kind: "wall", label: "Wall" }] },
  { category: "Lighting", items: [{ kind: "light", label: "Point Light", lightType: "point" }] }

];

// assetId -> GLB url, derived from the catalog. Only furniture has a url,
// so the type-predicate filter keeps walls (and anything urless) out.
export const registory: Record<string, string> = Object.fromEntries(
  CATALOG.flatMap((section) => section.items)
    .filter((item): item is FurnitureItem => item.kind === "furniture")
    .map((item) => [item.assetId, item.url])
);
