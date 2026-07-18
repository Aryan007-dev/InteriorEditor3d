import { useGLTF, Clone } from "@react-three/drei";
import { useLayoutEffect, useState } from "react";
import * as THREE from "three";
import { FURNITURE_BY_ID } from "./catalog";

function Furniture({ url, id }: { url: string; id: string }) {
  const gltf = useGLTF(url);
  // Bake the asset so its bounding-box BOTTOM sits at the group origin. We lift
  // the raw GLB up by its native `box.min.y` (a per-asset constant), and the
  // OUTER group's scale [s,s,s] scales that lift automatically. Result: node Y
  // = 0 ALWAYS means "bottom on the floor" — no fragile groundOffset scalar, no
  // double-scaling, and it can't go stale because we measure the real geometry.
  const [lift, setLift] = useState(0);

  useLayoutEffect(() => {
    const entry = FURNITURE_BY_ID[id];
    if (!entry) return;
    if (typeof entry.lift === "number") {
      setLift(entry.lift);
      return;
    }
    if (!gltf?.scene) return;
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const s = entry.scale ?? 1;
    const footprint: [number, number] = [
      +Math.max(size.x * s, 0.01).toFixed(2),
      +Math.max(size.z * s, 0.01).toFixed(2),
    ];
    // Native lift: shift the model up so its lowest vertex hits y = 0. The outer
    // group scale turns this into the correct world lift automatically.
    const nativeLift = -box.min.y;
    FURNITURE_BY_ID[id] = { ...entry, footprint, lift: nativeLift };
    setLift(nativeLift);
  }, [id, gltf]);

  return (
    <group>
      <group position={[0, lift, 0]}>
        <Clone object={gltf.scene} />
      </group>
    </group>
  );
}

export default Furniture;
