import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Grid,
  ContactShadows,
  Environment,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import { Suspense, useEffect, useState, useRef } from "react";
import * as THREE from "three";
import { useEditor } from "./store";
import { registory } from "./catalog";
import Wall from "./wall";
import Furniture from "./furniture";
import Floor from "./floor";

// --- AABB collision prevention (no physics engine) ---------------------------
// We keep furniture from entering walls / other furniture by testing
// axis-aligned bounding boxes in the XZ (top-down) plane during a drag.
type AABB = { minX: number; maxX: number; minZ: number; maxZ: number };

// A wall is a rotated box; expand it to its axis-aligned footprint.
// Uses the SAME orientation math as wall.tsx (angle = -atan2(dz, dx)).
function wallAABB(start: [number, number, number], end: [number, number, number], thickness: number): AABB {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;   // unit vector along the wall
  const px = -dz / len, pz = dx / len;  // unit vector perpendicular (thickness)
  const half = len / 2, t = thickness / 2;
  const midX = (start[0] + end[0]) / 2, midZ = (start[2] + end[2]) / 2;
  const corners: [number, number][] = [
    [half, t], [half, -t], [-half, t], [-half, -t],
  ].map(([lx, lz]) => [midX + lx * ux + lz * px, midZ + lx * uz + lz * pz]);
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

// Collect every wall + every OTHER furniture item as an obstacle box.
function obstaclesFor(scene: THREE.Object3D | null, selfId: string): AABB[] {
  const out: AABB[] = [];
  const nodes = useEditor.getState().doc.nodes;
  for (const n of Object.values(nodes)) {
    if (n.id === selfId) continue;
    if (n.type === "wall") {
      out.push(wallAABB(n.start, n.end, n.thickness));
    } else if (n.type === "furniture") {
      const o = scene?.getObjectByProperty("name", n.id) as THREE.Object3D | undefined;
      if (o) {
        const b = new THREE.Box3().setFromObject(o);
        out.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
      }
    }
  }
  return out;
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

// True if placing `id` at (position, quat) makes its footprint overlap any
// wall or other furniture. Updates the live object's world matrix first so the
// measurement reflects the PROPOSED transform, not its last rendered one.
function furnitureCollides(id: string, scene: THREE.Object3D | null, position: THREE.Vector3, quat: THREE.Quaternion): boolean {
  const obj = scene?.getObjectByProperty("name", id) as THREE.Object3D | undefined;
  if (!obj) return false;
  obj.position.copy(position);
  obj.quaternion.copy(quat);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const foot: AABB = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
  return obstaclesFor(scene, id).some((o) => aabbOverlap(foot, o));
}

// --- WASD camera navigation (upright; OrbitControls preserved) ---------------
// Keyboard navigation since OrbitControls has no keyboard support:
// WASD + ArrowUp/ArrowDown translate the camera (and the orbit target) along the
// camera's horizontal forward/right vectors and vertically. ArrowLeft/ArrowRight
// turn the view IN PLACE (orbit the look-target around the camera), so it never
// swings around the origin. Camera Y is clamped to stay above the floor. Orbit
// center follows the camera so mouse-orbit still works.
function WasdCamera({ speed = 6 }: { speed?: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls); // OrbitControls (makeDefault)
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key.startsWith("Arrow")) e.preventDefault(); // stop page scroll
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, delta) => {
    const k = keys.current;
    const controlsObj = controls as any;
    const target = controlsObj?.target as THREE.Vector3 | undefined;
    const minY = 0; // camera never dips below the floor

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize(); // flatten → move along the floor
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);

    // Translation: WASD + ArrowUp/ArrowDown (vertical lift)
    const move = new THREE.Vector3();
    if (k["w"]) move.add(forward);
    if (k["s"]) move.sub(forward);
    if (k["d"]) move.add(right);
    if (k["a"]) move.sub(right);
    if (k["arrowup"]) move.add(worldUp);
    if (k["arrowdown"]) move.sub(worldUp);

    // Yaw: ArrowLeft / ArrowRight turn the view IN PLACE (orbit the target
    // around the camera) instead of swinging the camera around the origin.
    let yaw = 0;
    const rotSpeed = 0.8; // radians per second
    if (k["arrowleft"]) yaw += rotSpeed * delta;
    if (k["arrowright"]) yaw -= rotSpeed * delta;

    if (move.lengthSq() === 0 && yaw === 0) return;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * delta); // frame-rate independent
      camera.position.add(move);
      target?.add(move); // move orbit center too
      if (camera.position.y < minY) camera.position.y = minY; // stay above floor
    }

    if (yaw !== 0 && target) {
      // rotate the look-target around the camera → camera yaws in place
      const offset = new THREE.Vector3().subVectors(target, camera.position);
      offset.applyAxisAngle(worldUp, yaw);
      target.copy(camera.position).add(offset);
    }

    controlsObj?.update?.();
  });

  return null;
}

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

  // If the GPU drops the WebGL context (overload, tab switch, driver), the
  // canvas goes blank and won't draw again until the context is restored.
  // We listen for that event, preventDefault (which lets the browser restore
  // it automatically), and show a banner so it isn't a silent blank screen.
  const [contextLost, setContextLost] = useState(false);

  // DEBUG: log every time the node set changes, broken down by type, so we can
  // see whether walls added by the AI actually reach the renderer.
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const n of Object.values(nodes)) counts[n.type] = (counts[n.type] ?? 0) + 1;
    console.log("[Scene] nodes changed:", JSON.stringify(counts), "total:", Object.keys(nodes).length);
  }, [nodes]);

  useEffect(() => {
    console.log("[Scene] MOUNTED (canvas active)");
    return () => console.log("[Scene] UNMOUNTED (canvas torn down)");
  }, []);

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
        const cx = n.transform.position[0];
        const cz = n.transform.position[2];
        if (selectedHandle.dimension === "width") {
          targetPos = [cx + (selectedHandle.side === "min" ? -1 : 1) * (n.width / 2), 0.15, cz];
        } else {
          targetPos = [cx, 0.15, cz + (selectedHandle.side === "min" ? -1 : 1) * (n.length / 2)];
        }
      }
      }
    else if (selectedIds[0]) {
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
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds[0]) {
        removeNode(selectedIds[0]);
        select([]);
        setSelectedHandle(null)
      }
      if (e.key === "t") setMode("translate");
      if (e.key === "r") setMode("rotate");
      if (e.key === "e") setMode("scale");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, removeNode, select, setMode]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {contextLost && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#b00",
            color: "white",
            padding: "8px 12px",
            fontFamily: "sans-serif",
            textAlign: "center",
          }}
        >
          WebGL context was lost (GPU reset). The view will recover
          automatically — if it stays blank, hard-refresh (Cmd/Ctrl+Shift+R).
        </div>
      )}
      <Canvas

        style={{ width: "100%", height: "100%" }}
        camera={{ position: [8, 8, 8], fov: 50 }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener(
            "webglcontextlost",
            (e) => {
              e.preventDefault(); // REQUIRED so the browser will restore it
              setContextLost(true);
            },
            false
          );
          canvas.addEventListener(
            "webglcontextrestored",
            () => {
              setContextLost(false);
            },
            false
          );
        }}
        onPointerMissed={() => {
          select([]);
          setSelectedHandle(null);
        }}
      >
        <color attach="background" args={["#ffffff"]} />
        <object3D ref={setProxy} />
        <Grid cellSize={1} position={[0, -0.05, 0]} cellColor={"blue"} sectionColor={"black"} infiniteGrid />
        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2} />
        <WasdCamera />

        <ContactShadows position={[0, 0., 0]} opacity={2} scale={10} blur={2} />

        <Suspense fallback={null}>
          <Environment preset="apartment" />

          {Object.values(nodes).map((node) => {
            if (node.type === "wall") {
              const sx = node.start[0], sz = node.start[2];
              const ex = node.end[0], ez = node.end[2];
              const dx = ex - sx, dz = ez - sz;
              const wlen = Math.hypot(dx, dz) || 1;
              const ox = dx / wlen, oz = dz / wlen;
              const off = 0.4;
              // Place the grab spheres just BEYOND the wall ends so the wall box
              // can't sit in front of them and steal the click (which made the
              // gizmo never appear on the sphere). The gizmo target (origin) stays
              // at the real corner so moveCorner moves the correct endpoint.
              const startPos: [number, number, number] = [sx - ox * off, 0, sz - oz * off];
              const endPos: [number, number, number] = [ex + ox * off, 0, ez + oz * off];
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
                      <mesh position={startPos}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHandle({ kind: "wall", id: node.id, which: "start", origin: [node.start[0], 0, node.start[2]] })
                          select([node.id])
                        }}>
                        <sphereGeometry args={[0.25, 16, 16]} />
                        <meshBasicMaterial color="#2b7fff" depthTest={false} />

                      </mesh>
                      <mesh position={endPos}
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
                        position={[-node.width / 2, 0.25, 0]}
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
                // The GLB is baked so its bounding-box bottom sits at the group
                // origin (see Furniture.tsx), so node Y = 0 already means "bottom
                // on the floor". No per-asset groundOffset scalar needed.
                const p = node.transform.position;
                return (
                  <group
                    key={node.id}
                    name={node.id}
                    position={[p[0], p[1], p[2]]}
                    quaternion={node.transform.rotation}
                    scale={node.transform.scale}
                    onClick={(e) => {
                      e.stopPropagation();
                      select([node.id]);
                      setSelectedHandle(null);
                    }}
                  >
                    <Furniture url={url} id={node.assetId} />
                  </group>
                );
              }
            }
            if (node.type === "light") {
              return (
                <mesh key={node.id}
                  name={node.id}
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
            translationSnap={0.25}
            rotationSnap={Math.PI / 12}
            object={proxy}
            mode={mode}

            // Live tracking: while dragging the proxy, copy its transform onto the
            // REAL selected object so it follows the gizmo. The store is only
            // written on mouse-up, so undo stays a single step.
            onObjectChange={() => {
              const id = selectedIds[0];
              if (!id) return;
              const n = nodes[id];
              // The GLB is baked so its bottom sits at the group origin; node Y
              // directly equals the floor height, so we copy the proxy transform
              // straight through (no groundOffset to add). Non-furniture nodes
              // are copied the same way.
              if (selectedHandle?.kind === "wall" || selectedHandle?.kind === "floor") {
                proxy.position.y = Math.max(0, proxy.position.y);
              } else if (!selectedHandle) {
                // plain node selection (furniture, lights, boxes) — never let it sink below floor
                proxy.position.y = Math.max(0, proxy.position.y);
              }
              const obj = proxy.parent?.getObjectByProperty("name", id) as THREE.Object3D | undefined;
              // Walls/floors aren't dragged live by their GROUP: walls draw from
              // start/end, floors recenter on resize. Moving their GROUP here would
              // drag the whole thing with the gizmo. They update only on mouse-up.
              // Furniture/lights follow the gizmo live.
              const isHandle = selectedHandle?.kind === "wall" || selectedHandle?.kind === "floor";
              if (obj && !isHandle) {
                obj.position.set(proxy.position.x, proxy.position.y, proxy.position.z);
                obj.quaternion.copy(proxy.quaternion);
                obj.updateMatrixWorld(true); // so Box3.setFromObject measures the NEW position
                // AABB collision prevention: block furniture from entering walls
                // or other furniture. We test the dragged item's world footprint
                // against every obstacle; on overlap we revert to the last
                // committed transform so the drag simply "sticks" at the boundary.
                if (n?.type === "furniture") {
                  const box = new THREE.Box3().setFromObject(obj);
                  const foot: AABB = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
                  const obstacles = obstaclesFor(proxy.parent ?? null, id);
                  if (obstacles.some((o) => aabbOverlap(foot, o))) {
                    const last = n.transform;
                    obj.position.set(last.position[0], last.position[1], last.position[2]);
                    obj.quaternion.set(last.rotation[0], last.rotation[1], last.rotation[2], last.rotation[3]);
                    proxy.position.set(last.position[0], last.position[1], last.position[2]);
                    proxy.quaternion.set(last.rotation[0], last.rotation[1], last.rotation[2], last.rotation[3]);
                    return;
                  }
                }
              }
            }}
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
                  // Snap this wall's end onto a nearby existing corner so walls can
                  // be joined by dropping one end onto another. We move ONLY the
                  // dragged wall's endpoint — other walls keep their own corners
                  // (no auto-fusion) — so dragging one side extends just that side.
                  let snapped: [number, number, number] = target;
                  for (const n of Object.values(nodes)) {
                    if (n.type !== "wall") continue;
                    for (const pt of [n.start, n.end]) {
                      const dist = Math.hypot(pt[0] - target[0], pt[2] - target[2]);
                      if (dist < 0.4) snapped = [pt[0], 0, pt[2]];
                    }
                  }
                  const wall = nodes[selectedHandle.id];
                  if (wall?.type === "wall") {
                    const partial =
                      selectedHandle.which === "start" ? { start: snapped } : { end: snapped };
                    updateNode(selectedHandle.id, partial);
                  }
                  setSelectedHandle({ ...selectedHandle, origin: snapped });
                }
              } else if (selectedHandle?.kind === "floor") {
                const fl = nodes[selectedHandle.id];
                if (fl?.type === "Floor") {
                  const cx = fl.transform.position[0];
                  const cz = fl.transform.position[2];
                  const posY = fl.transform.position[1];
                  if (selectedHandle.dimension === "width") {
                    // keep the OPPOSITE edge fixed; grow only the dragged side
                    const fixedMin = cx - fl.width / 2;
                    const fixedMax = cx + fl.width / 2;
                    let newWidth: number, newCenterX: number;
                    if (selectedHandle.side === "max") {
                      const m = p.x;
                      newWidth = Math.max(0.1, m - fixedMin);
                      newCenterX = (fixedMin + m) / 2;
                    } else {
                      const m = p.x;
                      newWidth = Math.max(0.1, fixedMax - m);
                      newCenterX = (m + fixedMax) / 2;
                    }
                    updateNode(selectedHandle.id, {
                      width: newWidth,
                      transform: { ...fl.transform, position: [newCenterX, posY, cz] },
                    });
                  } else {
                    const fixedMin = cz - fl.length / 2;
                    const fixedMax = cz + fl.length / 2;
                    let newLength: number, newCenterZ: number;
                    if (selectedHandle.side === "max") {
                      const m = p.z;
                      newLength = Math.max(0.1, m - fixedMin);
                      newCenterZ = (fixedMin + m) / 2;
                    } else {
                      const m = p.z;
                      newLength = Math.max(0.1, fixedMax - m);
                      newCenterZ = (m + fixedMax) / 2;
                    }
                    updateNode(selectedHandle.id, {
                      length: newLength,
                      transform: { ...fl.transform, position: [cx, posY, newCenterZ] },
                    });
                  }
                }
                setSelectedHandle(null);
              } else {
                const n = nodes[selectedIds[0]];
                // Safety net: refuse to commit a placement that overlaps a wall or
                // other furniture, even if the live drag slipped through.
                const finalPos = new THREE.Vector3(p.x, p.y, p.z);
                const finalQuat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
                if (n?.type === "furniture" && furnitureCollides(selectedIds[0], proxy.parent ?? null, finalPos, finalQuat)) {
                  const last = n.transform;
                  const obj = proxy.parent?.getObjectByProperty("name", selectedIds[0]) as THREE.Object3D | undefined;
                  if (obj) {
                    obj.position.set(last.position[0], last.position[1], last.position[2]);
                    obj.quaternion.set(last.rotation[0], last.rotation[1], last.rotation[2], last.rotation[3]);
                  }
                  proxy.position.set(last.position[0], last.position[1], last.position[2]);
                  proxy.quaternion.set(last.rotation[0], last.rotation[1], last.rotation[2], last.rotation[3]);
                  return;
                }
                updateTransform(selectedIds[0], {
                  position: [p.x, p.y, p.z],
                  rotation: [q.x, q.y, q.z, q.w],
                });
              }


            }}
          />
        )}
      </Canvas>
    </div>
  );
}

export default Scene;
