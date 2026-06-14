import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import dns from "dns";
import { connectDB } from "./config/db";
import { apiRouter } from "./routes/api";
import { tenantMiddleware } from "./middleware/tenant";

dns.setDefaultResultOrder("ipv4first");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend requests
app.use(cors());

// Parse incoming JSON and URL-encoded requests with limits
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Resolve subdomain tenant contexts globally
app.use(tenantMiddleware);

// Routes
app.use("/api", apiRouter);

// Basic health check routes
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Accounting SaaS server running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Accounting SaaS server running" });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error"
  });
});

// Start Server after connecting to MongoDB
async function startServer() {
  await connectDB();
  const portNum = typeof PORT === "string" ? parseInt(PORT, 10) : Number(PORT);
  app.listen(portNum, "0.0.0.0", () => {
    console.log(`Server is running on port ${portNum} (bound to 0.0.0.0)`);
  });
}

startServer();
