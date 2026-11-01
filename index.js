
require("dotenv").config();

const dns = require("node:dns");
const express = require("express");
const cors = require("cors");

const { connectDB, getDB, closeDB } = require("./src/config/db");

// Use Google DNS for this Node.js process
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

// Main route
app.get("/", (req, res) => {
  res.send("StudioSpace API Server is Running!");
});

// Database health check
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

// Unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// Start server after connecting to MongoDB
async function startServer() {
  try {
    const db = await connectDB();

    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();

    const existingNames = collections.map(
      (collection) => collection.name
    );

    for (const name of ["studios", "bookings"]) {
      if (!existingNames.includes(name)) {
        await db.createCollection(name);
        console.log(`${name} collection created`);
      }
    }

    const server = app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
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
