
require("dotenv").config();

const dns = require("node:dns");
const express = require("express");
const cors = require("cors");

const {
  connectDB,
  getDB,
  closeDB,
} = require("./src/config/db");

// ============================================
// IMPORT STUDIO ROUTES
// ============================================

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

// ============================================
// IMPORT BOOKING ROUTES
// ============================================

// Customer booking routes
const bookingRoutes = require(
  "./src/routes/bookingRoutes"
);

// Host booking management
const hostBookingRoutes = require(
  "./src/routes/hostBookingRoutes"
);

// ============================================
// EMAIL NOTIFICATION MIDDLEWARE
// ============================================

const bookingEmailMiddleware = require(
  "./src/middleware/bookingEmailMiddleware"
);

// ============================================
// EXPRESS CONFIGURATION
// ============================================

const app = express();

const PORT = process.env.PORT || 5000;

const CLIENT_URL =
  process.env.CLIENT_URL ||
  "http://localhost:3000";

// ============================================
// LOCAL MONGODB ATLAS DNS WORKAROUND
// ============================================

if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

// ============================================
// GLOBAL MIDDLEWARE
// ============================================

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" }));

// ============================================
// MAIN ROUTE
// ============================================

app.get("/", (req, res) => {
  return res.send(
    "StudioSpace API Server is Running!"
  );
});

// ============================================
// HEALTH CHECK
// ============================================

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

// ============================================
// STUDIO API ROUTES
// ============================================

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

// ============================================
// CUSTOMER BOOKING ORIGIN PROTECTION
// ============================================

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

// ============================================
// EMAIL NOTIFICATION MIDDLEWARE
// ============================================

// Watch successful customer booking actions.
// This middleware does not change the booking
// response or booking data.
app.use(
  "/api/bookings",
  bookingEmailMiddleware
);

// Watch successful host booking actions,
// including approval and rejection.
app.use(
  "/api/host",
  bookingEmailMiddleware
);

// ============================================
// CUSTOMER BOOKING API
// ============================================

// GET /api/bookings/availability/:studioId
// GET /api/bookings/my
// POST /api/bookings
// PATCH /api/bookings/:id/cancel
// PATCH /api/bookings/:id/reschedule

app.use(
  "/api/bookings",
  bookingRoutes
);

// ============================================
// HOST BOOKING API
// ============================================

// GET /api/host/bookings
// PATCH /api/host/bookings/:id/approve
// PATCH /api/host/bookings/:id/reject

app.use(
  "/api/host",
  hostBookingRoutes
);

// ============================================
// UNKNOWN API ROUTES
// ============================================

app.use("/api", (req, res) => {
  return res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  return res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

// ============================================
// START EXPRESS SERVER
// ============================================

async function startServer() {
  try {
    const db = await connectDB();

    // ========================================
    // ENSURE REQUIRED COLLECTIONS EXIST
    // ========================================

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

    // ========================================
    // DATABASE INDEXES
    // ========================================

    // Improve booking conflict searches.
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

    // ========================================
    // START LISTENING
    // ========================================

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

      // ======================================
      // EMAIL SERVICE STATUS
      // ======================================

      if (
        process.env.RESEND_API_KEY &&
        process.env.EMAIL_FROM
      ) {
        console.log(
          "Booking email notifications: Configured"
        );
      } else {
        console.log(
          "Booking email notifications: Disabled"
        );

        console.log(
          "Configure RESEND_API_KEY and EMAIL_FROM to enable emails."
        );
      }
    });

    // ========================================
    // GRACEFUL SHUTDOWN
    // ========================================

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
