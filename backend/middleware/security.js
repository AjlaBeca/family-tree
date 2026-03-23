const cors = require("cors");
const express = require("express");

const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const isPrivateIpv4Host = (hostname) => {
  const text = String(hostname || "").trim();
  if (!text) return false;
  if (/^10\./.test(text)) return true;
  if (/^192\.168\./.test(text)) return true;
  const match172 = text.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const second = Number(match172[1]);
    if (Number.isInteger(second) && second >= 16 && second <= 31) return true;
  }
  return false;
};

const isImplicitlyAllowedDevOrigin = (origin) => {
  try {
    const parsed = new URL(String(origin || ""));
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") return false;
    const host = String(parsed.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
    if (isPrivateIpv4Host(host)) return true;
    return false;
  } catch {
    return false;
  }
};

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
  const allowConfiguredByHost = (origin) => {
    try {
      const incoming = new URL(String(origin || ""));
      return allowedOrigins.some((item) => {
        try {
          const cfg = new URL(String(item || ""));
          return (
            String(cfg.hostname || "").toLowerCase() === String(incoming.hostname || "").toLowerCase()
          );
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  };
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowAll || allowedOrigins.includes(origin)) return callback(null, true);
      if (allowConfiguredByHost(origin)) return callback(null, true);
      if (isImplicitlyAllowedDevOrigin(origin)) return callback(null, true);
      console.warn(`[CORS] Blocked origin: ${origin}`);
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
