import express from "express";
import { HttpAgent } from "@ag-ui/client";
import { mountThreadModule } from "../../src/index.js";

const app = express();
const agentUrl = process.env.AGENT_URL ?? "http://127.0.0.1:8001/book-agent";

const threadModule = await mountThreadModule({
  framework: "express",
  app,
  basePath: "/api/copilotkit",
  agents: {
    dashboard: new HttpAgent({ url: agentUrl }),
  },
  cors: true,
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    agentUrl,
    storeDriver: process.env.STORE_DRIVER ?? "sqlite",
  });
});

async function shutdown() {
  await threadModule.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

app.listen(Number(process.env.PORT ?? 4000), () => {
  console.log("Thread manager example listening on http://localhost:4000");
});
