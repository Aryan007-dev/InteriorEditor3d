import { create } from "zustand";
import { produceWithPatches, applyPatches, enablePatches } from "immer";
import type { Patch } from "immer";

enablePatches();
type Entry = { patches: Patch[]; inverse: Patch[] };
type Vec3 = [number, number, number]
type Quat = [number, number, number, number]

// two floor points count as the "same corner" if their x and z are within 1cm
const samePoint = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[2] - b[2]) < 0.01;


interface Transform {
    position: Vec3,
    rotation: Quat,
    scale: Vec3
}

interface BaseNode {
    id: string,
    name: string,
    parentId: string | null;
    transform: Transform
}
interface FloorNode extends BaseNode {
    type: "Floor",
    assetId: "laminate" | "concrete",
    length: number,
    width: number
}
interface FurnitureNode extends BaseNode {
    type: "furniture";
    assetId: string;
    materialOverrides?: Record<string, string>
    // Real footprint [width (x), depth (z)] in meters, measured from the GLB's
    // bounding box at load time. Used by findFreeSpace for accurate overlap tests.
    footprint?: [number, number]
}
interface WallNode extends BaseNode {
    type: "wall";
    materialId: string;
    start: Vec3;
    end: Vec3
    height: number
    thickness: number

}
interface LightNode extends BaseNode {
    type: "light"
    lightType: "point" | "spot" | "area"
    intensity: number
    color: string
    temperature?: number
}
export type SceneNode = FurnitureNode | WallNode | LightNode | FloorNode;

interface SceneDocument {
    id: string,
    floorPlan: [number, number][]
    version: number
    room: { width: number; length: number; height: number }
    nodes: Record<string, SceneNode>
}

interface EditorState {
    doc: SceneDocument;
    selectedIds: string[];
    undoStack: Entry[];
    redoStack: Entry[];
    addNode: (n: SceneNode) => void;
    updateTransform: (id: string, t: Partial<Transform>) => void;
    updateNode: (id: string, t: Partial<SceneNode>) => void;
    moveCorner: (from: Vec3, to: Vec3) => void;
    removeNode: (id: string) => void;
    select: (ids: string[]) => void;
    undo: () => void;
    redo: () => void;
    setFloorPlan: (p: [number, number][]) => void;
    buildRoomFromPlan: () => void;
    mode: "translate" | "rotate" | "scale";
    setMode: (m: "translate" | "rotate" | "scale") => void;
}

export const useEditor = create<EditorState>((set, get) => {
    const commit = (recipe: (d: SceneDocument) => void) => {
        const before = Object.keys(get().doc.nodes).length;
        const [next, patches, inverse] = produceWithPatches(get().doc, recipe)
        const after = Object.keys(next.nodes).length;
        console.log("[store.commit] nodes", before, "->", after, "| patches:", patches.length);
        set((s) => ({
            doc: next,
            undoStack: [...s.undoStack, { patches, inverse }],
            redoStack: []
        }))

    }
    return {
        doc: { id: crypto.randomUUID(), version: 1, room: { width: 5, length: 4, height: 2.7 }, nodes: {}, floorPlan: [] },
        selectedIds: [],
        undoStack: [],
        redoStack: [],
        mode: "translate",
        setMode: (m) => set({ mode: m }),

        addNode: (n) => { console.log("[store.addNode]", n.type, n.id); commit((d) => { d.nodes[n.id] = n; }); },
        setFloorPlan: (p: [number, number][]) => commit((d) => { d.floorPlan = p }),
        buildRoomFromPlan: () => {
            const scale = 50;
            const pts = get().doc.floorPlan;
            if (pts.length < 3) return;            // need at least a triangle
            commit((d) => {
                for (let i = 0; i < pts.length; i++) {
                    const a = pts[i];
                    const b = pts[(i + 1) % pts.length];   // wrap to close the loop
                    const id = crypto.randomUUID();
                    d.nodes[id] = {
                        id, name: "Wall", parentId: null,
                        transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
                        type: "wall",
                        start: [a[0] / scale, 0, a[1] / scale],   // px → metres; SVG y = world z
                        end: [b[0] / scale, 0, b[1] / scale],
                        height: 2.7, thickness: 0.1, materialId: "wall",
                    };
                }
            });
        },
        updateTransform: (id, t) => commit((d) => { Object.assign(d.nodes[id].transform, t); }),
        removeNode: (id) => commit((d) => { delete d.nodes[id]; }),
        updateNode: (id, partial) => commit((d) => { Object.assign(d.nodes[id], partial); }),
        moveCorner: (from, to) => commit((d) => {
            // move EVERY wall endpoint sitting at `from` onto `to`, in one undoable step
            for (const id in d.nodes) {
                const n = d.nodes[id];
                if (n.type !== "wall") continue;
                if (samePoint(n.start, from)) n.start = to;
                if (samePoint(n.end, from)) n.end = to;
            }
        }),

        select: (ids) => set({ selectedIds: ids }),
        redo: () => set((s) => {
            const next = s.redoStack.at(-1);      // the most recently undone change
            if (!next) return s;                  // nothing to redo → leave unchanged
            return {
                doc: applyPatches(s.doc, next.patches),   // apply the "what changed" note (forward)
                undoStack: [...s.undoStack, next],        // move it back onto the undo pile
                redoStack: s.redoStack.slice(0, -1),      // drop it from the redo pile
            };
        }),
        undo: () => set((s) => {
            const last = s.undoStack.at(-1)
            if (!last) return s;
            return {
                doc: applyPatches(s.doc, last.inverse),
                undoStack: s.undoStack.slice(0, -1),
                redoStack: [...s.redoStack, last],
            };
        }),
    };

})
