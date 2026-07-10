
import { Text } from "@react-three/drei"
import { Billboard } from "@react-three/drei"
import { materials } from "./materials"
import SurfaceMaterial from "./SurfaceMaterial"
import { Edges } from "@react-three/drei"
function Wall({start,end,height,thickness,materialId,selected}:{
    start:[number,number]
    end:[number,number]
    height:number
    thickness:number
    materialId:string
    selected:boolean

}){
   

    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.sqrt(dx * dx + dz * dz);
    const midX = (start[0] + end[0]) / 2;
    const midZ = (start[1] + end[1]) / 2;
    const angle = -Math.atan2(dz, dx);    
    return (<>
        <Billboard position={[midX,height/2+0.5,midZ]}>
        <Text  fontSize={0.3} color={"black"} material-depthTest={false}>
        {`${length.toFixed(2)}m`}
        </Text>
        </Billboard>
        <mesh position={[midX,height/2,midZ]}
        rotation={[0,angle,0]}
        >
        <boxGeometry args={[length,height,thickness]}/>
       <SurfaceMaterial finish={materials[materialId]}></SurfaceMaterial>
        {selected && <Edges color="#b52323" />}
        </mesh>
        </>
    )
}
export default Wall