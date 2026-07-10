import { useGLTF,Clone } from "@react-three/drei";
function Furniture({ url }: { url: string }) {
  const banana = useGLTF(url)
  return <Clone object={banana.scene} />
}

export default Furniture