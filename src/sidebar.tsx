import { CATALOG } from "./catalog";
import { useEditor } from "./store";

function SideBar() {
    const addNode = useEditor((s) => s.addNode);

    return (
        <div style={{ width: 180, borderRight: "1px solid #ccc", padding: 8 }}>
            {CATALOG.map((section) => (
                <div key={section.category}>
                    <h4>{section.category}</h4>
                    {section.items.map((item) => {

                        return (

                            <div

                                key={item.label}
                                onClick={() => {
                                    if (item.kind === "wall") {
                                        const ox = Math.random() * 4;
                                        const oz = Math.random() * 4;
                                        addNode({
                                            id: crypto.randomUUID(),
                                            name: item.label,
                                            parentId: null,
                                            transform: {
                                                position: [0, 0, 0],
                                                rotation: [0, 0, 0, 1],
                                                scale: [1, 1, 1],
                                            },
                                            type: "wall",
                                            start: [ox, 0, oz],
                                            end: [ox + 2, 0, oz],
                                            height: 2.7,
                                            thickness: 0.1,
                                            materialId: "wall",
                                        });
                                    }
                                    else if (item.kind=="light"){
                                        addNode({
                                            id: crypto.randomUUID(),
                                            name: item.label,
                                            parentId: null,
                                            transform: {
                                                position: [Math.random() * 4, 0, Math.random() * 4],
                                                rotation: [0, 0, 0, 1],
                                                scale: [1, 1, 1],
                                            },
                                            type: "light",
                                            lightType:item.lightType,
                                            intensity:20,
                                            color:"red"

                                           
                                        });
                                    }
                                     else {
                                        addNode({
                                            id: crypto.randomUUID(),
                                            name: item.label,
                                            parentId: null,
                                            transform: {
                                                position: [Math.random() * 4, 0, Math.random() * 4],
                                                rotation: [0, 0, 0, 1],
                                                scale: [1, 1, 1],
                                            },
                                            type: "furniture",
                                            assetId: item.assetId,
                                        });
                                    }
                                }}
                            >
                                {item.label}
                            </div>
                        )
                    })}
                </div>
            ))}
        </div>
    );
}

export default SideBar;
