import { Canvas } from "@react-three/fiber";

import {
  Grid,
  ContactShadows,
  Environment,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import { Suspense, useEffect, useState } from "react";
import { useEditor } from "./store";
import { registory } from "./catalog";
import Wall from "./wall";
import Furniture from "./furniture";
import Floor from "./floor";

function Scene() {
  const moveCorner = useEditor((s) => s.moveCorner)
  const updateNode = useEditor((s) => s.updateNode)
  const nodes = useEditor((s) => s.doc.nodes);
  const select = useEditor((s) => s.select);
  const selectedIds = useEditor((s) => s.selectedIds);
  const updateTransform = useEditor((s) => s.updateTransform);
  const removeNode = useEditor((s) => s.removeNode);
  const mode = useEditor((s) => s.mode);
  const setMode = useEditor((s) => s.setMode);
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [selectedHandle, setSelectedHandle] = useState<{ id: string; which: "start" | "end" | "move"; origin: [number, number, number] } | null>(null)

  useEffect(() => {
    const onKey = (e: any) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds[0]) {
        removeNode(selectedIds[0]);
        select([]);
        setSelectedObject(null);
        setSelectedHandle(null)
      }
      if (e.key === "t") setMode("translate");
      if (e.key === "r") setMode("rotate");
      if (e.key === "s") setMode("scale");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, removeNode, select, setMode]);

  return (
    <Canvas
      style={{ width: "100%", height: 500 }}
      camera={{ position: [8, 8, 8], fov: 50 }}
      onPointerMissed={() => {
        select([]);
        setSelectedObject(null);
        setSelectedHandle(null);
      }}
    >
      <Grid cellSize={1} position={[0, 0, 0]} cellColor={"blue"} sectionColor={"black"} infiniteGrid />
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2} />

      <ContactShadows position={[0, 0.0, 0]} opacity={2} scale={10} blur={2} />

      <Suspense fallback={null}>
        <Environment preset="apartment" />
        <Floor />
        {Object.values(nodes).map((node) => {
          if (node.type === "wall") {
            return (
              
              <group
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  select([node.id]);
                  setSelectedObject(null);
                  setSelectedHandle(null);
                }}
              >
                {selectedIds.includes(node.id) && (
                  <>
                <mesh position={[node.start[0], 0, node.start[2]]}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    setSelectedObject(e.object)
                    setSelectedHandle({ id: node.id, which: "start", origin: [node.start[0], 0, node.start[2]] })
                    select([node.id])
                  }}>
                  <sphereGeometry args={[0.25, 16, 16]} />
                  <meshBasicMaterial color="#2b7fff" depthTest={false} />

                </mesh>
                <mesh position={[node.end[0], 0, node.end[2]]}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedObject(e.object)
                    setSelectedHandle({ id: node.id, which: "end", origin: [node.end[0], 0, node.end[2]] })
                    select([node.id])
                  }}
                  >
                  <sphereGeometry args={[0.25, 16, 16]} />
                  <meshBasicMaterial color="#2b7fff" depthTest={false}/>

                </mesh>
                <mesh position={[(node.start[0] + node.end[0]) / 2, 0, (node.start[2] + node.end[2]) / 2]}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedObject(e.object)
                    setSelectedHandle({ id: node.id, which: "move", origin: [(node.start[0] + node.end[0]) / 2, 0, (node.start[2] + node.end[2]) / 2] })
                    select([node.id])
                  }}>
                  <sphereGeometry args={[0.28, 16, 16]} />
                  <meshBasicMaterial color="#37c26a" depthTest={false} />
                </mesh>
                  </>
                )}
                <Wall

                  key={node.id}
                  start={[node.start[0], node.start[2]]}
                  end={[node.end[0], node.end[2]]}
                  height={node.height}
                  thickness={node.thickness}
                  materialId={node.materialId}
                  selected={selectedIds.includes(node.id)}
                />
                </group>
             
            );
          }
          if (node.type === "furniture") {
            const url = registory[node.assetId];
            if (url) {
              return (
                <group
                  key={node.id}
                  position={node.transform.position}
                  quaternion={node.transform.rotation}
                  onClick={(e) => {
                    e.stopPropagation();
                    select([node.id]);
                    setSelectedObject(e.eventObject);
                  }}
                >
                  <Furniture url={url} />
                </group>
              );
            }
          }
          if (node.type==="light"){
            return (
              <mesh key ={node.id}
              position={node.transform.position}
              onClick={(e)=>{
                e.stopPropagation();
                select([node.id])
                setSelectedObject(e.eventObject);
              }}>
                <sphereGeometry args={[0.15, 16, 16]} />
                <meshBasicMaterial color={"yellow"}/>
                <pointLight intensity={node.intensity} color={node.color}/>
              </mesh>
            )
          }
          return (
            <mesh
              key={node.id}
              position={node.transform.position}
              scale={node.transform.scale}
              onClick={(e) => {
                e.stopPropagation();
                select([node.id]);
                setSelectedObject(e.object);
              }}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color={selectedIds.includes(node.id) ? "blue" : "green"} />
            </mesh>
          );
        })}
      </Suspense>

      {selectedObject && (
        <TransformControls
          translationSnap={1}
          onObjectChange={() => {
            selectedObject.position.y = Math.max(0, selectedObject.position.y)
          }}
          rotationSnap={Math.PI / 12}
          object={selectedObject}
          mode={mode}
          onMouseUp={() => 
            {
            const p = selectedObject.position;
            const q = selectedObject.quaternion;
            if(selectedHandle){
              if (selectedHandle.which === "move") {
                const wall = nodes[selectedHandle.id];
                if (wall?.type === "wall") {
                  const dx = p.x - selectedHandle.origin[0];
                  const dz = p.z - selectedHandle.origin[2];
                  updateNode(selectedHandle.id, {
                    start: [wall.start[0] + dx, 0, wall.start[2] + dz],
                    end: [wall.end[0] + dx, 0, wall.end[2] + dz],
                  });
                  setSelectedHandle({ ...selectedHandle, origin: [p.x, 0, p.z] });
                }
              } else {
              const target: [number, number, number] = [p.x, 0, p.z];
              // snap onto a nearby OTHER corner so walls fuse together
              let snapped: [number, number, number] = target;
              for (const n of Object.values(nodes)) {
                if (n.type !== "wall") continue;
                for (const pt of [n.start, n.end]) {
                  // ignore the corner we're currently dragging
                  if (Math.abs(pt[0] - selectedHandle.origin[0]) < 0.01 && Math.abs(pt[2] - selectedHandle.origin[2]) < 0.01) continue;
                  const dist = Math.hypot(pt[0] - target[0], pt[2] - target[2]);
                  if (dist < 0.4) snapped = [pt[0], 0, pt[2]];
                }
              }
              // move every wall endpoint at the old corner onto the new spot (one undo step)
              moveCorner(selectedHandle.origin, snapped);
              setSelectedHandle({ ...selectedHandle, origin: snapped });
              }
            }else{
              updateTransform(selectedIds[0], {
              position: [p.x, p.y, p.z],
              rotation: [q.x, q.y, q.z, q.w],
            });
            }
            
            
          }}
        />
      )}
    </Canvas>
  );
}

export default Scene;
