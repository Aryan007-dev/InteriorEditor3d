import { useTexture } from "@react-three/drei";
import * as THREE from "three";

function Floor() {
  const textures = useTexture({
    map: "/textures/laminate_floor_02_diff_2k.jpg",
    normalMap: "/textures/laminate_floor_02_nor_gl_2k.jpg",
    roughnessMap: "/textures/laminate_floor_02_rough_2k.jpg",
  });

  Object.values(textures).forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(25, 25);
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial {...textures} />
    </mesh>
  );
}

export default Floor;
