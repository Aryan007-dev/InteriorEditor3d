import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import OpenAI from "openai";

const MODEL = "openai/gpt-4o";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const token = env.GITHUB_TOKEN;

  return {
    plugins: [
      react(),
      {
        name: "ai-chat-proxy",
        configureServer(server) {
          server.middlewares.use("/api/chat", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405; res.end("Method Not Allowed"); return;
            }
            let body = "";
            req.on("data", (chunk) => (body += chunk));     // stream the request body in
            req.on("end", async () => {                       // body fully received
              try {
                const { messages, tools } = JSON.parse(body);
                const client = new OpenAI({
                  baseURL: "https://models.github.ai/inference",
                  apiKey: token,
                });
                const completion = await client.chat.completions.create({
                  model: MODEL,
                  messages,
                  tools,
                  temperature: 0.2,
                });
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(completion.choices[0].message)); // ← what the browser gets
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: String(err) }));
              }
            });
          });
        },
      },
    ],
  };
});
