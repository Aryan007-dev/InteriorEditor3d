import { CATALOG } from "../catalog";
import type { FurnitureItem } from "../catalog";


export function DescribeCatalog(): string {
    const lines = CATALOG.map((section) => {
        const itemText = section.items.filter((item): item is FurnitureItem => item.kind === "furniture")
            .map((item) => `${item.label} (${item.assetId})`)
            .join(", ")
        return `${section.category}: ${itemText}`;
    })
    return lines.join("\n")



}