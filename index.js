
require("dotenv").config();

const dns = require("node:dns");
const express = require("express");
const cors = require("cors");

const {
  connectDB,
  getDB,
  closeDB,
} = require("./src/config/db");

// Public studio browsing
const studioRoutes = require(
  "./src/routes/studioRoutes"
);

// Authenticated studio creation
const createStudioRoutes = require(
  "./src/routes/createStudioRoutes"
);

// Owner-specific studio listings
const ownerStudioRoutes = require(
  "./src/routes/ownerStudioRoutes"
);

// Secure studio editing
const editStudioRoutes = require(
  "./src/routes/editStudioRoutes"
);

// Secure studio deletion
const deleteStudioRoutes = require(
  "./src/routes/deleteStudioRoutes"
);

// Customer booking routes
const bookingRoutes = require(
  "./src/routes/bookingRoutes"
);

// NEW: Host booking management
const hostBookingRoutes = require(
  "./src/routes/hostBookingRoutes"
);

const app = express();

const PORT = process.env.PORT || 5000;

const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:3000";

// -------------------------------------
// Local MongoDB Atlas DNS workaround
// -------------------------------------

if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

// -------------------------------------
// Global middleware
// -------------------------------------

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" }));

// -------------------------------------
// Main route
// -------------------------------------

app.get("/", (req, res) => {
  return res.send(
    "StudioSpace API Server is Running!"
  );
});

// -------------------------------------
// Health check
// -------------------------------------

app.get("/api/health", async (req, res) => {
  try {
    const db = getDB();

    await db.command({ ping: 1 });

    return res.status(200).json({
      success: true,
      message:
        "StudioSpace server and MongoDB are connected!",
      database: db.databaseName,
    });
  } catch (error) {
    console.error(
      "Health check error:",
      error.message
    );

    return res.status(503).json({
      success: false,
      message: "Database connection unavailable.",
    });
  }
});

// -------------------------------------
// Studio API routes
// -------------------------------------

// GET /api/studios/mine
app.use(
  "/api/studios",
  ownerStudioRoutes
);

// POST /api/studios
app.use(
  "/api/studios",
  createStudioRoutes
);

// PATCH /api/studios/:id
app.use(
  "/api/studios",
  editStudioRoutes
);

// DELETE /api/studios/:id
app.use(
  "/api/studios",
  deleteStudioRoutes
);

// GET /api/studios
// GET /api/studios/featured
// GET /api/studios/:id
app.use(
  "/api/studios",
  studioRoutes
);

// -------------------------------------
// Customer booking origin protection
// -------------------------------------

app.use("/api/bookings", (req, res, next) => {
  const protectedMethods = [
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ];

  if (!protectedMethods.includes(req.method)) {
    return next();
  }

  if (req.headers.origin !== CLIENT_URL) {
    return res.status(403).json({
      success: false,
      message: "Invalid request origin.",
    });
  }

  next();
});

// -------------------------------------
// Customer booking API
// -------------------------------------

// GET /api/bookings/my
// POST /api/bookings
// PATCH /api/bookings/:id/cancel
app.use(
  "/api/bookings",
  bookingRoutes
);

// -------------------------------------
// Host booking API
// -------------------------------------

// GET /api/host/bookings
// Returns reservations received for
// studios owned by the logged-in user.
app.use(
  "/api/host",
  hostBookingRoutes
);

// -------------------------------------
// Unknown API routes
// -------------------------------------

app.use("/api", (req, res) => {
  return res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

// -------------------------------------
// Global error handler
// -------------------------------------

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  return res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

// -------------------------------------
// Start Express server
// -------------------------------------

async function startServer() {
  try {
    const db = await connectDB();

    // Ensure required collections exist.
    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();

    const collectionNames = collections.map(
      (collection) => collection.name
    );

    for (const name of [
      "studios",
      "bookings",
    ]) {
      if (!collectionNames.includes(name)) {
        await db.createCollection(name);
      }
    }

    // Improve booking searches.
    await db
      .collection("bookings")
      .createIndex({
        studioId: 1,
        date: 1,
        status: 1,
        startMinutes: 1,
        endMinutes: 1,
      });

    // Improve studio ownership searches.
    await db
      .collection("studios")
      .createIndex({
        ownerId: 1,
        createdAt: -1,
      });

    // Improve host booking lookups.
    await db
      .collection("bookings")
      .createIndex({
        studioId: 1,
        createdAt: -1,
      });

    const server = app.listen(PORT, () => {
      console.log(
        `Server running at http://localhost:${PORT}`
      );

      console.log("StudioSpace APIs are ready!");
      console.log("Studio browsing API: Ready");
      console.log("Studio creation API: Ready");
      console.log("Owner listings API: Ready");
      console.log("Studio editing API: Ready");
      console.log("Studio deletion API: Ready");
      console.log("Customer booking API: Ready");
      console.log("Host booking API: Ready");
    });

    // -------------------------------------
    // Graceful shutdown
    // -------------------------------------

    let shuttingDown = false;

    async function shutdown() {
      if (shuttingDown) return;

      shuttingDown = true;

      server.close(async () => {
        try {
          await closeDB();
        } catch (error) {
          console.error(
            "Database shutdown error:",
            error
          );
        }

        process.exit(0);
      });
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error(
      "Server startup failed:",
      error.message
    );

    try {
      await closeDB();
    } catch (closeError) {
      console.error(
        "Database cleanup error:",
        closeError
      );
    }

    process.exit(1);
  }
}

startServer();
