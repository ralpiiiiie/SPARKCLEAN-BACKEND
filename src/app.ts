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
import { branchesRouter } from "./modules/branches/routes.js";
import { plantsRouter } from "./modules/plants/routes.js";
import { servicesRouter } from "./modules/services/routes.js";
import { customersRouter } from "./modules/customers/routes.js";
import { ordersRouter } from "./modules/orders/routes.js";
import { demandRouter } from "./modules/demand/routes.js";
import { campaignsRouter } from "./modules/campaigns/routes.js";
import { deliveriesRouter } from "./modules/deliveries/routes.js";
import { deliveryCostsRouter } from "./modules/deliveryCosts/routes.js";
import { settingsRouter } from "./modules/settings/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { analyticsRouter } from "./modules/analytics/overview.routes.js";
import { notesRouter } from "./modules/analytics/notes.routes.js";
import { savedViewsRouter } from "./modules/analytics/savedViews.routes.js";
import { forecastRunsRouter } from "./modules/analytics/forecastRuns.routes.js";
import { modelOverridesRouter } from "./modules/analytics/modelOverrides.routes.js";
import { costAssumptionsRouter } from "./modules/analytics/costAssumptions.routes.js";
import { scenariosRouter } from "./modules/analytics/scenarios.routes.js";
import { scheduleItemsRouter } from "./modules/analytics/scheduleItems.routes.js";
import { procedureRunsRouter } from "./modules/ba/procedureRuns.routes.js";
import { recommendationsRouter } from "./modules/ba/recommendations.routes.js";
import { reportsRouter } from "./modules/ba/reports.routes.js";
import { exportsRouter } from "./modules/exports/routes.js";

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
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

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
  } catch (error) {
    res.status(503).json({ 
      status: "degraded", 
      database: "down",
      timestamp: new Date().toISOString(),
    });
  }
});

api.use("/dashboard", dashboardRouter);
api.use("/branches", branchesRouter);
api.use("/plants", plantsRouter);
api.use("/services", servicesRouter);
api.use("/customers", customersRouter);
api.use("/orders", ordersRouter);
api.use("/demand", demandRouter);
api.use("/campaigns", campaignsRouter);
api.use("/deliveries", deliveriesRouter);
api.use("/delivery-costs", deliveryCostsRouter);
api.use("/settings", settingsRouter);
api.use("/analytics/notes", notesRouter);
api.use("/analytics/saved-views", savedViewsRouter);
api.use("/analytics/forecast-runs", forecastRunsRouter);
api.use("/analytics/model-overrides", modelOverridesRouter);
api.use("/analytics/cost-assumptions", costAssumptionsRouter);
api.use("/analytics/scenarios", scenariosRouter);
api.use("/analytics/schedule-items", scheduleItemsRouter);
api.use("/analytics", analyticsRouter);
api.use("/ba/procedure-runs", procedureRunsRouter);
api.use("/ba/recommendations", recommendationsRouter);
api.use("/ba/reports", reportsRouter);
api.use("/export", exportsRouter);

app.use("/api/v1", api);

app.get("/", (_req, res) => {
  res.json({
    name: "Spark Clean Laundry API",
    version: "1.0.0",
    docs: "/api/v1/health",
  });
});

app.use(notFound);
app.use(errorHandler);
