import { useTexture } from "@react-three/drei"
import * as THREE from "three"
import type { Finish, TextureFinish } from "./materials"

function ColorMaterial({ color }: { color: string }) {
  return <meshStandardMaterial color={color} />
}

function TextureMaterial({finish}:{finish:TextureFinish}){
    const textures =useTexture({
        map : finish.map,
        normalMap : finish.normalMap,
        roughnessMap: finish.roughnessMap
    })
    Object.values(textures).forEach((t)=>{
        t.wrapS =t.wrapT = THREE.RepeatWrapping
        t.repeat.set(finish.repeat,finish.repeat)
    })
    return <meshStandardMaterial {...textures}/>

}
function SurfaceMaterial({ finish }: { finish: Finish | undefined }) {
  if (finish?.kind === "texture") return <TextureMaterial finish={finish} />
  return <ColorMaterial color={finish?.color ?? "lightGray"} />
}

export default SurfaceMaterial
