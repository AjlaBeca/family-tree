const cors = require("cors");
const express = require("express");

const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const getAllowedOrigins = () => {
  const configured = parseCsv(process.env.CORS_ORIGINS);
  if (configured.length > 0) return configured;
  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
  ];
};

const createCorsOptions = () => {
  const allowedOrigins = getAllowedOrigins();
  const allowAll = allowedOrigins.includes("*");
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowAll || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Token"],
  };
};

const readApiToken = (req) => {
  const headerToken = String(req.headers["x-api-token"] || "").trim();
  if (headerToken) return headerToken;
  const auth = String(req.headers.authorization || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
};

const applySecurity = (app) => {
  const corsOptions = createCorsOptions();
  const jsonLimit = String(process.env.JSON_LIMIT || "8mb");
  const apiToken = String(process.env.API_TOKEN || "").trim();

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));

  app.use(express.json({ limit: jsonLimit }));
  app.use((err, req, res, next) => {
    if (err && err.type === "entity.too.large") {
      return res.status(413).json({
        error: "Upload je prevelik. Smanji velicinu ili broj slika u galeriji.",
      });
    }
    return next(err);
  });

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    if (req.path === "/api/health") return next();
    if (!apiToken) return next();

    const requestToken = readApiToken(req);
    if (!requestToken || requestToken !== apiToken) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    return next();
  });
};

module.exports = { applySecurity };
