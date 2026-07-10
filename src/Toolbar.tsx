import { useEditor } from "./store";

function Toolbar() {
  const doc = useEditor((s) => s.doc);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const addNode = useEditor((s) => s.addNode);
  const setMode = useEditor((s) => s.setMode);

  const addFurniture = (assetId: string, name: string) =>
    addNode({
      id: crypto.randomUUID(),
      name,
      parentId: null,
      transform: {
        position: [Math.random() * 4, 0, Math.random() * 4],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      type: "furniture",
      assetId,
    });

  return (
    <div>
      <button onClick={() => localStorage.setItem("scene", JSON.stringify(doc))}>Save</button>
      <button
        onClick={() => {
          const text = localStorage.getItem("scene");
          if (!text) return;
          useEditor.setState({ doc: JSON.parse(text), undoStack: [], redoStack: [] });
        }}
      >
        Load
      </button>
      <button onClick={() => addFurniture("cube", "Cube")}>Add Cube</button>
      <button onClick={() => addFurniture("sofa", "Sofa")}>Add Sofa</button>
      <button onClick={undo}>Undo</button>
      <button onClick={redo}>Redo</button>
      <button onClick={() => setMode("translate")}>Move</button>
      <button onClick={() => setMode("rotate")}>Rotate</button>
    </div>
  );
}

export default Toolbar;
