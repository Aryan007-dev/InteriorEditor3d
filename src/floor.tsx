import { useTexture } from "@react-three/drei";
import * as THREE from "three";

const FLOOR_TEXTURES = {
  laminate: {
    map: "/textures/laminate_floor_02_diff_2k.jpg",
    normalMap: "/textures/laminate_floor_02_nor_gl_2k.jpg",
    roughnessMap: "/textures/laminate_floor_02_rough_2k.jpg",
  },
  concrete: {
    map: "/textures/concrete_tile_facade_diff_2k.jpg",
    normalMap: "/textures/concrete_tile_facade_nor_gl_2k.jpg",
    roughnessMap: "/textures/concrete_tile_facade_arm_2k.jpg",
  },
} as const;

type FloorAssetId = keyof typeof FLOOR_TEXTURES;

function Floor({ assetId, length, width }: { assetId: FloorAssetId; length: number; width: number }) {
  const textures = useTexture(FLOOR_TEXTURES[assetId]);

  Object.values(textures).forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(25, 25);
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial {...textures} />
    </mesh>
  );
}

export default Floor;
