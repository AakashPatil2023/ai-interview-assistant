import envConfig from "./env.cjs";
import cors from "cors";
import express from "express";
import aiRouter from "./routes/ai.js";

const { envPath, error: envError } = envConfig.loadEnv();
if (envError) {
  console.warn(`Could not load AI configuration at ${envPath} (${envError.code || "read error"}).`);
} else {
  console.log(`AI configuration loaded from ${envPath}`);
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", aiRouter);

const server = app.listen(PORT, () => {
  console.log(`AI server listening on http://localhost:${PORT}`);
});

server.on("error", (error) => {
  console.error("SERVER ERROR:", error);
});
