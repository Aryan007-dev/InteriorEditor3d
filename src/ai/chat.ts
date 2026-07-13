import { systemPrompt } from "./systemPrompt";

import { runTool, TOOLS } from "./tools";
export type ChatMessage={
    role:"system"|"user"|"assistant"|"tool";
    content:string
    tool_call_id?: string;
    tool_calls?:{id:string;function :{name:string,arguments:string} 
    } []
};
export async function sendMessage(history:ChatMessage[] ,userText:string):Promise<ChatMessage[]> {
    const system:ChatMessage={role:"system", content:systemPrompt()};
    const apiMessage:ChatMessage[]=[system,...history,{role:"user",content:userText}];
    const tools =TOOLS.map((t)=>({
        type:"function",
        function:{name:t.name,description:t.description,parameters:t.input_schema}
    }));
    while(true){
        const res = await fetch("/api/chat",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({messages:apiMessage,tools})

        });
        const message = (await res.json() as ChatMessage)
        apiMessage.push(message)
        if(!message.tool_calls?.length) break
        for(const call of message.tool_calls){
            const args =JSON.parse(call.function.arguments||"{}")
            const result = runTool(call.function.name,args)
            apiMessage.push({ role: "tool", tool_call_id: call.id, content: result });
        }

    }
    return apiMessage.slice(1);
    
}