import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Chat model is served through an OpenAI-COMPATIBLE endpoint so the
// browser-side chat.ts / tools.ts (which send standard messages+tools) work
// unchanged. Provider is picked by CHAT_PROVIDER (default: gemini). Catalog
// VISION enrichment (scripts/enrich.mjs) still uses Groq directly — keep
// GROQ_API_KEY set for that.
//
//   CHAT_PROVIDER=gemini  -> GEMINI_API_KEY,  model GEMINI_MODEL  (default gemini-2.5-flash)
//   CHAT_PROVIDER=groq    -> GROQ_API_KEY,     model GROQ_MODEL    (default openai/gpt-oss-120b)
//   CHAT_PROVIDER=nvidia  -> NVIDIA_API_KEY,   model NVIDIA_MODEL  (default deepseek-ai/deepseek-v4-flash, thinking on)
const PROVIDERS = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    key: "GEMINI_API_KEY",
    model: "gemini-3.5-flash",
    modelEnv: "GEMINI_MODEL",
    thinking: false,
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    key: "GROQ_API_KEY",
    model: "openai/gpt-oss-120b",
    modelEnv: "GROQ_MODEL",
    thinking: false,
  },
  nvidia: {
    baseURL: "https://integrate.api.nvidia.com/v1",
    key: "NVIDIA_API_KEY",
    model: "deepseek-ai/deepseek-v4-flash",
    modelEnv: "NVIDIA_MODEL",
    thinking: true,
  },
} as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const providerName = (env.CHAT_PROVIDER || "gemini") as keyof typeof PROVIDERS;
  const PROV = PROVIDERS[providerName] ?? PROVIDERS.gemini;
  const apiKey = env[PROV.key];
  const MODEL = env[PROV.modelEnv] || PROV.model;
  const thinking = PROV.thinking;

  if (!apiKey) {
    console.warn(`[proxy] WARNING: ${PROV.key} is not set in .env — AI calls will fail.`);
  }

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
            req.on("data", (chunk) => (body += chunk));
            req.on("end", async () => {
              try {
                const { messages, tools } = JSON.parse(body);
                console.log(`[proxy][${providerName}] inbound messages:`, messages.length, "tools:", (tools || []).length);
                const payload: Record<string, unknown> = {
                  model: MODEL,
                  messages,
                  tools,
                  temperature: 1,
                  top_p: 0.95,
                  max_tokens: 16384,
                };
                // NVIDIA needs thinking at the top level; others ignore it.
                if (thinking) payload.chat_template_kwargs = { thinking: true, reasoning_effort: "high" };

                const t0 = Date.now();
                console.log(`[proxy][${providerName}] calling model`, MODEL, "at", new Date().toISOString());
                const r = await fetch(`${PROV.baseURL}/chat/completions`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(payload),
                });
                if (!r.ok) {
                  const text = await r.text();
                  throw new Error(`${providerName} HTTP ${r.status}: ${text}`);
                }
                const data = await r.json() as { choices: { message: any }[] };
                const msg = data.choices[0].message;
                const toolNames = (msg.tool_calls ?? [])
                  .filter((t: any) => t.type === "function")
                  .map((t: any) => t.function?.name);
                console.log(`[proxy][${providerName}] replied in`, Date.now() - t0, "ms. tool_calls:", toolNames);
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(msg));
              } catch (err) {
                console.error("[proxy] MODEL CALL FAILED:", err);
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ role: "assistant", content: `Assistant error: ${String(err)}` }));
              }
            });
          });
        },
      },
    ],
  };
});
