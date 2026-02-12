import "dotenv/config";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*").split(",").map(origin => origin.trim());
  const origin = req.headers.origin;

  if (allowedOrigins.includes("*")) {
    res.header("Access-Control-Allow-Origin", "*");
  } else if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

let PROJECTS = {};

try {
  PROJECTS = JSON.parse(process.env.PROJECTS || "{}");
  console.log("Projects carregados:", Object.keys(PROJECTS));
} catch (e) {
  console.log("PROJECTS inválido no .env", e);
  PROJECTS = {};
}

// Isso aqui define a rota que vou solicitar algo

app.get("/health", (req, res) => {
  res.send("OK");
});

app.get("/track", (req, res) => {
  res.send(PROJECTS);
});

app.post("/track", async (req, res) => {
  const data = req.body;
  console.log("Tracking data received:", data);

  const courseID = data._courseID;

  // Verifica se existe configuração para este courseID
  const projectConfig = PROJECTS[courseID];

  if (!projectConfig || !projectConfig.upstream) {
    console.warn(`[API] Configuration not found for courseID: ${courseID}`);
    // Retorna sucesso para o cliente não travar, mas avisa que pulou o envio
    return res.status(200).json({ status: "skipped", message: "No upstream configuration found" });
  }

  try {
    // Prepara o payload para enviar ao Google Sheets (upstream)
    const payload = { ...data };

    // Injeta o segredo se existir
    if (projectConfig.secret) {
      payload._serverSecret = projectConfig.secret; // Google Apps Script expected the key as _serverSecret
    }

    console.log(`[API] Forwarding to upstream: ${projectConfig.upstream}`);

    const response = await fetch(projectConfig.upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // O Google Apps Script às vezes retorna redirect (302) ou texto simples
    const responseText = await response.text();
    console.log(`[API] Upstream response (${response.status}):`, responseText);

    res.status(200).json({
      status: "success",
      upstream_status: response.status,
      upstream_response: responseText
    });
  } catch (error) {
    console.error("[API] Error forwarding to upstream:", error);
    res.status(500).json({ status: "error", message: "Failed to forward data" });
  }
});
