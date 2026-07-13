import { Canvas } from "@react-three/fiber";

import {
  Grid,
  ContactShadows,
  Environment,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
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
  const [selectedHandle, setSelectedHandle] = useState<
    | { kind: "wall"; id: string; which: "start" | "end" | "move"; origin: [number, number, number] }
    | { kind: "floor"; id: string; dimension: "width" | "length"; side: "min" | "max" }
    | null
  >(null)

  // A single, PERSISTENT invisible object that never leaves the scene graph.
  // We attach TransformControls to THIS, not to the meshes/handles (which R3F
  // may rebuild or unmount). We move the proxy to whatever is selected, let the
  // user drag it, then write the result back to the store. This eliminates the
  // "attached object must be part of the scene graph" errors entirely.
  const [proxy, setProxy] = useState<THREE.Object3D | null>(null);

  // Work out where the proxy should sit for the current selection.
  let targetPos: [number, number, number] | null = null;
  let targetQuat: [number, number, number, number] = [0, 0, 0, 1];
  if (selectedHandle?.kind === "wall") {
    targetPos = selectedHandle.origin;
  } else if (selectedHandle?.kind === "floor") {
    const n = nodes[selectedHandle.id];
    if (n?.type === "Floor") {
      if (selectedHandle.dimension === "width") {
        targetPos = [(selectedHandle.side === "min" ? -1 : 1) * (n.width / 2), 0.15, 0];
      } else {
        targetPos = [0, 0.15, (selectedHandle.side === "min" ? -1 : 1) * (n.length / 2)];
      }
    }
  } else if (selectedIds[0]) {
    const n = nodes[selectedIds[0]];
    if (n) {
      targetPos = n.transform.position;
      targetQuat = n.transform.rotation;
    }
  }
  const hasSelection = targetPos !== null;

  // Sync the proxy to the target position/rotation whenever the selection
  // (or the underlying node) changes. During a drag nothing re-renders, so the
  // proxy isn't reset mid-drag; after the store updates on mouse-up, it snaps
  // to the new value (which matches where the user dragged to).
  const posKey = targetPos ? targetPos.join(",") : "";
  const quatKey = targetQuat.join(",");
  useEffect(() => {
    if (proxy && targetPos) {
      proxy.position.set(targetPos[0], targetPos[1], targetPos[2]);
      proxy.quaternion.set(targetQuat[0], targetQuat[1], targetQuat[2], targetQuat[3]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxy, posKey, quatKey]);

  useEffect(() => {
    const onKey = (e: any) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds[0]) {
        removeNode(selectedIds[0]);
        select([]);
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
      style={{ width: "100%", height: "100%" }}
      camera={{ position: [8, 8, 8], fov: 50 }}
      onPointerMissed={() => {
        select([]);
        setSelectedHandle(null);
      }}
    >
      <color attach="background" args={["#ffffff"]} />
      <object3D ref={setProxy} />
      <Grid cellSize={1} position={[0, 0, 0]} cellColor={"blue"} sectionColor={"black"} infiniteGrid />
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2} />

      <ContactShadows position={[0, 0.0, 0]} opacity={2} scale={10} blur={2} />

      <Suspense fallback={null}>
        <Environment preset="apartment" />

        {Object.values(nodes).map((node) => {
          if (node.type === "wall") {
            return (

              <group
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  select([node.id]);

                  setSelectedHandle(null);
                }}
              >
                {selectedIds.includes(node.id) && (
                  <>
                    <mesh position={[node.start[0], 0, node.start[2]]}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHandle({ kind: "wall", id: node.id, which: "start", origin: [node.start[0], 0, node.start[2]] })
                        select([node.id])
                      }}>
                      <sphereGeometry args={[0.25, 16, 16]} />
                      <meshBasicMaterial color="#2b7fff" depthTest={false} />

                    </mesh>
                    <mesh position={[node.end[0], 0, node.end[2]]}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHandle({ kind: "wall", id: node.id, which: "end", origin: [node.end[0], 0, node.end[2]] })
                        select([node.id])
                      }}
                    >
                      <sphereGeometry args={[0.25, 16, 16]} />
                      <meshBasicMaterial color="#2b7fff" depthTest={false} />

                    </mesh>
                    <mesh position={[(node.start[0] + node.end[0]) / 2, 0, (node.start[2] + node.end[2]) / 2]}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHandle({ kind: "wall", id: node.id, which: "move", origin: [(node.start[0] + node.end[0]) / 2, 0, (node.start[2] + node.end[2]) / 2] })
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
          if (node.type === "Floor") {
            return (
              <group
                key={node.id}
                position={node.transform.position}
                quaternion={node.transform.rotation}
                scale={node.transform.scale}
                onClick={(e) => {
                  e.stopPropagation();
                  select([node.id]);
                  setSelectedHandle(null);
                }}>
                <Floor
                  assetId={node.assetId}
                  length={node.length}
                  width={node.width}
                />
                {selectedIds.includes(node.id) && (
                  <>
                    <mesh
                      position={[-node.width / 2, 0.15, 0]}
                      onClick={(e) => {
                        e.stopPropagation();
                        select([node.id]);
                        setSelectedHandle({ kind: "floor", id: node.id, dimension: "width", side: "min" });
                      }}
                    >
                      <sphereGeometry args={[0.18, 16, 16]} />
                      <meshBasicMaterial color="#2b7fff" depthTest={false} />
                    </mesh>
                    <mesh
                      position={[node.width / 2, 0.15, 0]}
                      onClick={(e) => {
                        e.stopPropagation();
                        select([node.id]);
                        setSelectedHandle({ kind: "floor", id: node.id, dimension: "width", side: "max" });
                      }}
                    >
                      <sphereGeometry args={[0.18, 16, 16]} />
                      <meshBasicMaterial color="#2b7fff" depthTest={false} />
                    </mesh>
                    <mesh
                      position={[0, 0.15, -node.length / 2]}
                      onClick={(e) => {
                        e.stopPropagation();
                        select([node.id]);
                        setSelectedHandle({ kind: "floor", id: node.id, dimension: "length", side: "min" });
                      }}
                    >
                      <sphereGeometry args={[0.18, 16, 16]} />
                      <meshBasicMaterial color="#2b7fff" depthTest={false} />
                    </mesh>
                    <mesh
                      position={[0, 0.15, node.length / 2]}
                      onClick={(e) => {
                        e.stopPropagation();
                        select([node.id]);
                        setSelectedHandle({ kind: "floor", id: node.id, dimension: "length", side: "max" });
                      }}
                    >
                      <sphereGeometry args={[0.18, 16, 16]} />
                      <meshBasicMaterial color="#2b7fff" depthTest={false} />
                    </mesh>
                  </>
                )}
              </group>
            )

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
                    setSelectedHandle(null);
                  }}
                >
                  <Furniture url={url} />
                </group>
              );
            }
          }
          if (node.type === "light") {
            return (
              <mesh key={node.id}
                position={node.transform.position}
                onClick={(e) => {
                  e.stopPropagation();
                  select([node.id])
                  setSelectedHandle(null);
                }}>
                <sphereGeometry args={[0.15, 16, 16]} />
                <meshBasicMaterial color={"yellow"} />
                <pointLight intensity={node.intensity} color={node.color} />
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
                setSelectedHandle(null);
              }}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color={selectedIds.includes(node.id) ? "blue" : "green"} />
            </mesh>
          );
        })}
      </Suspense>

      {hasSelection && proxy && (
        <TransformControls
          translationSnap={1}
          onObjectChange={() => {
            proxy.position.y = Math.max(0, proxy.position.y)
          }}
          rotationSnap={Math.PI / 12}
          object={proxy}
          mode={mode}
          onMouseUp={() => {
            const p = proxy.position;
            const q = proxy.quaternion;
            if (selectedHandle?.kind === "wall") {
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
            } else if (selectedHandle?.kind === "floor") {
              const dimension = selectedHandle.dimension === "width"
                ? Math.max(0.1, Math.abs(p.x) * 2)
                : Math.max(0.1, Math.abs(p.z) * 2);
              updateNode(selectedHandle.id, { [selectedHandle.dimension]: dimension });
              setSelectedHandle(null);
            } else {
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
