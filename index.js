require("dotenv").config();
const dns = require("node:dns");
const express = require("express");
const cors = require("cors");
const { connectDB, getDB, closeDB } = require("./src/config/db");
const studioRoutes = require("./src/routes/studioRoutes");
const createStudioRoutes = require("./src/routes/createStudioRoutes");
const ownerStudioRoutes = require("./src/routes/ownerStudioRoutes");
const editStudioRoutes = require("./src/routes/editStudioRoutes");
const deleteStudioRoutes = require("./src/routes/deleteStudioRoutes");
const bookingRoutes = require("./src/routes/bookingRoutes");
const hostBookingRoutes = require("./src/routes/hostBookingRoutes");
const bookingEmailMiddleware = require("./src/middleware/bookingEmailMiddleware");
const hostAvailabilityRoutes = require("./src/routes/hostAvailabilityRoutes");
const bookingBlockGuard = require("./src/middleware/bookingBlockGuard");
const adminRoutes = require("./src/routes/adminRoutes");
const completeBookingRoutes = require("./src/routes/completeBookingRoutes");
const invoiceRoutes = require("./src/routes/invoiceRoutes");
const favoritesRoutes = require("./src/routes/favoritesRoutes");
const reviewRoutes = require("./src/routes/reviewRoutes");
const requireAuth = require("./src/middleware/requireAuth");

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => {
  res.send("StudioSpace API Server is Running!");
});

app.get("/api/health", async (_req, res) => {
  try {
    const db = getDB();
    await db.command({ ping: 1 });
    res.status(200).json({
      success: true,
      message: "StudioSpace server and MongoDB are connected!",
      database: db.databaseName,
    });
  } catch (error) {
    console.error(error);
    res.status(503).json({
      success: false,
      message: "Database connection unavailable.",
    });
  }
});

app.use("/api/studios", ownerStudioRoutes);
app.use("/api/studios", createStudioRoutes);
app.use("/api/studios", editStudioRoutes);
app.use("/api/studios", deleteStudioRoutes);
app.use("/api/studios", studioRoutes);


/*
  Challenge 1: JWT Authentication

  Check authentication before validating the origin.
  Unauthenticated booking requests must receive 401.
*/

// Protect POST /api/bookings first
app.use("/api/bookings", (req, res, next) => {
  if (req.method === "POST" && req.path === "/") {
    return requireAuth(req, res, next);
  }

  next();
});

// Keep origin protection for booking mutations
app.use("/api/bookings", (req, res, next) => {
  const mutationMethods = [
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ];

  if (
    mutationMethods.includes(req.method) &&
    req.headers.origin !== CLIENT_URL
  ) {
    return res.status(403).json({
      success: false,
      message: "Invalid request origin.",
    });
  }

  next();
});


app.use("/api/bookings", bookingEmailMiddleware);
app.use("/api/host", bookingEmailMiddleware);
app.use("/api/bookings", bookingBlockGuard);
app.use("/api/bookings", bookingRoutes);
app.use("/api/host", hostAvailabilityRoutes);
app.use("/api/host", hostBookingRoutes);
app.use("/api/host", completeBookingRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api", (_req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

app.use((error, _req, res, _next) => {
  console.error("Server error:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

async function verifyAtomicBookingIndex(db) {
  const index = (await db.collection("bookings").indexes()).find(
    (item) => item.name === "unique_active_studio_booking_slots"
  );

  const keys = index?.key || {};
  const filter = index?.partialFilterExpression || {};
  const activeStatuses = filter.status?.$in;

  const valid =
    index?.unique === true &&
    Object.keys(keys).length === 3 &&
    keys.studioId === 1 &&
    keys.date === 1 &&
    keys.occupiedSlots === 1 &&
    filter.occupiedSlots?.$exists === true &&
    Array.isArray(activeStatuses) &&
    ["pending", "confirmed"].every((status) =>
      activeStatuses.includes(status)
    );

  if (!valid) {
    throw new Error(
      "Unique active booking-slot index is missing or invalid. " +
      "Back up the database, inspect existing bookings, and run " +
      "npm run booking:index before starting the API."
    );
  }

  console.log("Atomic booking-slot index verified.");
}

async function startServer() {
  try {
    const db = await connectDB();
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(
        (collection) => collection.name
      )
    );

    for (const name of ["studios", "bookings", "studioBlocks"]) {
      if (!existing.has(name)) await db.createCollection(name);
    }

    await db.collection("bookings").createIndex({
      studioId: 1,
      date: 1,
      status: 1,
      startMinutes: 1,
      endMinutes: 1,
    });
    await db.collection("studios").createIndex({
      ownerId: 1,
      createdAt: -1,
    });
    await db.collection("bookings").createIndex({
      studioId: 1,
      createdAt: -1,
    });
    await db.collection("studioBlocks").createIndex({
      studioId: 1,
      date: 1,
      startMinutes: 1,
      endMinutes: 1,
    });
    await db.collection("studioReviews").createIndex(
      { bookingId: 1 },
      { unique: true }
    );
    await db.collection("studioReviews").createIndex({
      studioId: 1,
      createdAt: -1,
    });
    await db.collection("userFavorites").createIndex(
      { userId: 1 },
      { unique: true }
    );

    // Refuse to accept bookings unless MongoDB prevents race conditions.
    await verifyAtomicBookingIndex(db);

    const server = app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(
        "StudioSpace booking, host, admin and availability routes ready"
      );
      console.log(
        process.env.RESEND_API_KEY && process.env.EMAIL_FROM
          ? "Booking email configured"
          : "Booking email disabled"
      );
    });

    let shuttingDown = false;
    async function shutdown() {
      if (shuttingDown) return;
      shuttingDown = true;
      server.close(async () => {
        try {
          await closeDB();
        } catch (error) {
          console.error(error);
        }
        process.exit(0);
      });
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Server startup failed:", error);
    try {
      await closeDB();
    } catch (closeError) {
      console.error(closeError);
    }
    process.exit(1);
  }
}

startServer();
