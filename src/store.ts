import { create } from "zustand";
import { produceWithPatches, applyPatches, enablePatches } from "immer";
import type { Patch } from "immer";

enablePatches();
type Entry = { patches: Patch[]; inverse: Patch[] };
type Vec3=[number,number,number]
type Quat=[number,number,number,number]

// two floor points count as the "same corner" if their x and z are within 1cm
const samePoint = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[2] - b[2]) < 0.01;


interface Transform{
    position:Vec3,
    rotation:Quat,
    scale:Vec3
}

interface BaseNode{
    id:string,
    name:string,
    parentId:string|null;
    transform:Transform
}

interface FurnitureNode extends BaseNode{
    type:"furniture";
    assetId:string;
    materialOverrides?:Record<string,string>
}
interface WallNode extends BaseNode{
    type:"wall";
    materialId:string;
    start:Vec3;
    end:Vec3
    height:number
    thickness:number

}
interface LightNode extends BaseNode{
    type:"light"
    lightType:"point" | "spot" | "area"
    intensity: number
    color:string
    temperature?:number
}
type SceneNode = FurnitureNode | WallNode | LightNode;

interface SceneDocument{
    id:string,
    version:number
    room:{width:number;length:number;height:number}
    nodes:Record<string,SceneNode>
}
interface EditorState {
    doc: SceneDocument;         
    selectedIds: string[];       
    undoStack: Entry[];          
    redoStack: Entry[];         
    addNode: (n: SceneNode) => void;
    updateTransform: (id: string, t: Partial<Transform>) => void;
    updateNode:(id:string,t:Partial<SceneNode>)=>void;
    moveCorner:(from:Vec3,to:Vec3)=>void;
    removeNode: (id: string) => void;
    select: (ids: string[]) => void;
    undo: () => void;
    redo: () => void;
    mode: "translate" | "rotate" | "scale";
    setMode: (m: "translate" | "rotate" | "scale") => void;
}

export const useEditor = create<EditorState>((set,get)=>{
    const commit =(recipe:(d:SceneDocument)=>void) =>{
        const [next,patches,inverse]=produceWithPatches(get().doc,recipe)
        set((s)=>({
            doc:next,
            undoStack:[...s.undoStack,{patches,inverse}],
            redoStack:[]
        }))
        
    }
        return {
        doc: { id: crypto.randomUUID(), version: 1, room: { width: 5, length: 4, height: 2.7 }, nodes: {} },
        selectedIds: [],
        undoStack: [],
        redoStack: [],
        mode: "translate",
        setMode: (m) => set({ mode: m }),

        addNode: (n) => commit((d) => { d.nodes[n.id] = n; }),
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
        undo: () => set((s)=> {
            const last =s.undoStack.at(-1)
            if(!last) return s;
            return{
                doc:applyPatches(s.doc,last.inverse),
                undoStack:s.undoStack.slice(0,-1),
                redoStack: [...s.redoStack,last],
            };
        }),
    };

})