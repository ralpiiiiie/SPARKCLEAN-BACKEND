import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { requireAuth } from "./middleware/auth.js";
import { authRouter } from "./modules/auth/routes.js";
import { analyticsRouter } from "./modules/analytics/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { exportsRouter } from "./modules/exports/routes.js";
import {
  customersRouter,
  machineUsageRouter,
  marketingRouter,
  ordersRouter,
  paymentsRouter,
  servicesRouter,
} from "./modules/records/routes.js";
import { settingsRouter } from "./modules/settings/routes.js";

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(compression());
app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const api = express.Router();

api.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      database: "up",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "degraded",
      database: "down",
      timestamp: new Date().toISOString(),
    });
  }
});

// Authentication endpoints manage their own guards (login must stay public).
api.use("/auth", authRouter);

// Everything below is private.
api.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
api.use(requireAuth);

api.use("/dashboard", dashboardRouter);
api.use("/analytics", analyticsRouter);
api.use("/customers", customersRouter);
api.use("/services", servicesRouter);
api.use("/orders", ordersRouter);
api.use("/payments", paymentsRouter);
api.use("/machine-usage", machineUsageRouter);
api.use("/marketing", marketingRouter);
api.use("/settings", settingsRouter);
api.use("/export", exportsRouter);

app.use("/api/v1", api);

app.get("/", (_req, res) => {
  res.json({
    name: "Spark Clean Laundry API",
    version: "2.0.0",
    docs: "/api/v1/health",
  });
});

app.use(notFound);
app.use(errorHandler);
