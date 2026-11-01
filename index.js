
require("dotenv").config();

const dns = require("node:dns");
const express = require("express");
const cors = require("cors");

const {
  connectDB,
  getDB,
  closeDB,
} = require("./src/config/db");

const studioRoutes = require("./src/routes/studioRoutes");
const bookingRoutes = require("./src/routes/bookingRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Local DNS workaround
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" }));

// Main route
app.get("/", (req, res) => {
  res.send("StudioSpace API Server is Running!");
});

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const db = getDB();
    await db.command({ ping: 1 });

    res.status(200).json({
      success: true,
      message: "StudioSpace server and MongoDB are connected!",
      database: db.databaseName,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: "Database connection unavailable",
    });
  }
});

// API routes
app.use("/api/studios", studioRoutes);

// Allow booking mutations only from the configured frontend origin
app.use("/api/bookings", (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  if (req.headers.origin !== process.env.CLIENT_URL) {
    return res.status(403).json({
      success: false,
      message: "Invalid request origin.",
    });
  }

  next();
});

app.use("/api/bookings", bookingRoutes);

// Unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

async function startServer() {
  try {
    const db = await connectDB();

    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();

    const names = collections.map((collection) => collection.name);

    for (const name of ["studios", "bookings"]) {
      if (!names.includes(name)) {
        await db.createCollection(name);
      }
    }

    await db.collection("bookings").createIndex({
      studioId: 1,
      date: 1,
      status: 1,
      startMinutes: 1,
      endMinutes: 1,
    });

    const server = app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log("Studio and Booking APIs are ready!");
    });

    async function shutdown() {
      server.close(async () => {
        await closeDB();
        process.exit(0);
      });
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Server startup failed:", error.message);
    await closeDB();
    process.exit(1);
  }
}

startServer();
