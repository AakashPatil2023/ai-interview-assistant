import "dotenv/config";
import cors from "cors";
import express from "express";
import aiRouter from "./routes/ai.js";

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
