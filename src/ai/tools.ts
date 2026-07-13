import { useEditor } from "../store";
import type { SceneNode } from "../store";

// Describes one input parameter in JSON Schema. `type` is required; the
// rest are optional. `items` lets a parameter be an array (e.g. position).
type JsonSchemaProp = {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
};

// A tool = one action the AI can call. It has a name, a plain-English
// description (the AI reads this to decide WHEN to use it), a JSON-Schema
// description of its inputs, and a handler that actually runs the action.
type Tool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, JsonSchemaProp>;
    required: string[];
  };
  // `args` is the parsed JSON the AI sends. `unknown` forces us to handle it safely.
  handler: (args: Record<string, unknown>) => void;
};

const addFurniture: Tool = {
  name: "addFurniture",
  description: "Add a furniture model from the catalog into the scene at a chosen position.",
  input_schema: {
    type: "object",
    properties: {
      assetId: {
        type: "string",
        description: "The catalog assetId to place, e.g. round_wooden_table_02_2k",
      },
      position: {
        type: "array",
        items: { type: "number" },
        description: "[x, y, z] world position in meters. y is up; use 0 to sit on the floor.",
      },
    },
    required: ["assetId"],
  },
  handler: (args) => {
    // `args` is `unknown`, so we must prove it's an array before indexing it.
    const raw = Array.isArray(args.position) ? args.position : [];
    const position: [number, number, number] = [
      Number(raw[0] ?? 0),
      Number(raw[1] ?? 0),
      Number(raw[2] ?? 0),
    ];

    // Build a full FurnitureNode. Annotating as SceneNode gives the object
    // literal "contextual typing": TS knows position must be a Vec3 tuple,
    // type must be the literal "furniture", etc.
    const node: SceneNode = {
      id: crypto.randomUUID(),
      name: String(args.assetId),
      parentId: null,
      type: "furniture",
      assetId: String(args.assetId),
      transform: {
        position,
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    };
    useEditor.getState().addNode(node);
  },
};
const undo :Tool={
    name:"undo",
    description:"undo the last action  happend",
    input_schema:{type:"object",properties:{},required:[]},
    handler(){
       useEditor.getState().undo()
    }

}
export const TOOLS: Tool[] = [addFurniture,undo];
export function runTool(name: string, args: Record<string, unknown>): string {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return `Unknown tool: ${name}`;
  }
  try {
    tool.handler(args);
    return `Ran ${name} successfully.`;
  } catch (err) {
    return `Error running ${name}: ${String(err)}`;
  }
}


