import { serializeScene } from "./serialize";
import { DescribeCatalog } from "./describeCatalog";
import { TOOLS } from "./tools";
export function systemPrompt(){
const toolsList = TOOLS.map((t)=> `-${t.name}: ${t.description}`).join("\n")
return `You are an interior-design assistant for a 3D room editor.
Rules:
- Only use the tools listed below.
- Only place assetIds that appear in the Catalog section.
- Keep replies short and factual.

Tools:
${toolsList}

Catalog (valid assetIds you may place):
${DescribeCatalog()}

Current scene:
${serializeScene()}
`;

}