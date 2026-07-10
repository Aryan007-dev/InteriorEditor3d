import { useState } from "react";

import { useEditor } from "./store";
import FloorPlan from "./FloorPlan";
import Toolbar from "./Toolbar";
import Scene from "./Scene";
import SideBar from "./sidebar";
import Inspector from "./Inspector";
const App = () => {
  const addNode = useEditor((s) => s.addNode);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [view, setView] = useState<"2d" | "3d">("2d");

  const buildWalls = () => {
    const scale = 50;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      addNode({
        id: crypto.randomUUID(),
        name: "Wall",
        parentId: null,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        type: "wall",
        start: [a[0] / scale, 0, a[1] / scale], // svg px → metres, as [x, 0, z]
        end: [b[0] / scale, 0, b[1] / scale],
        height: 2.7,
        thickness: 0.1,
        materialId: "wall",
      });
    }
  };

  return (
    <>
      <Toolbar />

      <button
        onClick={() => {
          if (view === "2d") {
            buildWalls();
            setPoints([]);
            setView("3d");
          } else {
            setView("2d");
          }
        }}
      >
        Switch to {view === "2d" ? "3D" : "2D"}
      </button>
      <div >
        <Inspector/>
      </div>
      <div style={{ display: "flex" }}>
        <SideBar />
        <div style={{ flex: 1 }}>
          {view === "2d" ? <FloorPlan points={points} setPoints={setPoints} /> : <Scene />}
        </div>
      </div>
    </>
  );
};

export default App;
