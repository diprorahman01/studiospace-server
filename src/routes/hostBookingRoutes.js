
const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:3000";

// -------------------------------------
// Shared helpers
// -------------------------------------

function isValidObjectId(id) {
  return (
    typeof id === "string" &&
    /^[a-fA-F0-9]{24}$/.test(id)
  );
}

function checkOrigin(req, res, next) {
  if (req.headers.origin !== CLIENT_URL) {
    return res.status(403).json({
      success: false,
      message: "Invalid request origin.",
    });
  }

  next();
}

async function getOwnedStudios(db, ownerId) {
  return db
    .collection("studios")
    .find(
      { ownerId },
      {
        projection: {
          _id: 1,
          title: 1,
          image: 1,
        },
      }
    )
    .toArray();
}

function getStudioIds(studios) {
  return studios.flatMap((studio) => [
    studio._id.toString(),
    studio._id,
  ]);
}

function getSummary(bookings) {
  return {
    total: bookings.length,
    pending: bookings.filter(
      (booking) => booking.status === "pending"
    ).length,
    confirmed: bookings.filter(
      (booking) => booking.status === "confirmed"
    ).length,
    cancelled: bookings.filter(
      (booking) => booking.status === "cancelled"
    ).length,
  };
}

// -------------------------------------
// GET /api/host/bookings
// List bookings for the owner's studios
// -------------------------------------

router.get("/bookings", requireAuth, async (req, res) => {
  try {
    const db = getDB();

    const ownerStudios = await getOwnedStudios(
      db,
      req.user.id
    );

    if (ownerStudios.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No hosted bookings found.",
        summary: {
          total: 0,
          pending: 0,
          confirmed: 0,
          cancelled: 0,
        },
        data: [],
      });
    }

    const bookings = await db
      .collection("bookings")
      .find({
        studioId: {
          $in: getStudioIds(ownerStudios),
        },
      })
      .sort({ createdAt: -1 })
      .toArray();

    const studioMap = new Map(
      ownerStudios.map((studio) => [
        studio._id.toString(),
        studio,
      ])
    );

    const data = bookings.map((booking) => {
      const studioId = String(booking.studioId);
      const studio = studioMap.get(studioId);

      return {
        ...booking,
        studioId,
        studioTitle:
          booking.studioTitle ||
          studio?.title ||
          "Studio",
        studioImage:
          booking.studioImage ||
          studio?.image ||
          "",
      };
    });

    return res.status(200).json({
      success: true,
      message: "Host bookings loaded successfully.",
      summary: getSummary(data),
      data,
    });
  } catch (error) {
    console.error("Host bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load host bookings.",
    });
  }
});

// -------------------------------------
// PATCH /api/host/bookings/:id/approve
// PATCH /api/host/bookings/:id/reject
// -------------------------------------

async function updateBookingStatus(req, res, action) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const db = getDB();
    const bookingsCollection = db.collection("bookings");

    const bookingId = new ObjectId(id);

    const booking = await bookingsCollection.findOne({
      _id: bookingId,
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Look up the studio that this booking belongs to.
    // The studio must exist and belong to this host.
    const studioId = String(booking.studioId);

    if (!isValidObjectId(studioId)) {
      return res.status(404).json({
        success: false,
        message: "Booking studio not found.",
      });
    }

    const studio = await db
      .collection("studios")
      .findOne({
        _id: new ObjectId(studioId),
        ownerId: req.user.id,
      });

    if (!studio) {
      // Do not reveal another owner's booking details.
      return res.status(404).json({
        success: false,
        message:
          "Booking not found or you do not have permission.",
      });
    }

    if (booking.status !== "pending") {
      return res.status(409).json({
        success: false,
        message:
          "Only pending bookings can be approved or rejected.",
      });
    }

    const now = new Date();

    const newStatus =
      action === "approve" ? "confirmed" : "cancelled";

    const updates = {
      status: newStatus,
      updatedAt: now,
    };

    if (action === "approve") {
      updates.confirmedAt = now;
    } else {
      updates.cancelledAt = now;
      updates.rejectedAt = now;
      updates.cancelledBy = "host";
    }

    // The status filter makes the transition atomic.
    // If another request processed the booking first,
    // matchedCount becomes zero.
    const result = await bookingsCollection.updateOne(
      {
        _id: bookingId,
        studioId: booking.studioId,
        status: "pending",
      },
      {
        $set: updates,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(409).json({
        success: false,
        message:
          "This booking has already been processed.",
      });
    }

    const updatedBooking =
      await bookingsCollection.findOne({
        _id: bookingId,
      });

    return res.status(200).json({
      success: true,
      message:
        action === "approve"
          ? "Booking approved successfully."
          : "Booking rejected successfully.",
      data: updatedBooking,
    });
  } catch (error) {
    console.error(
      `Host booking ${action} error:`,
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update the booking. Please try again.",
    });
  }
}

// Approve a pending reservation
router.patch(
  "/bookings/:id/approve",
  requireAuth,
  checkOrigin,
  async (req, res) => {
    return updateBookingStatus(req, res, "approve");
  }
);

// Reject a pending reservation
router.patch(
  "/bookings/:id/reject",
  requireAuth,
  checkOrigin,
  async (req, res) => {
    return updateBookingStatus(req, res, "reject");
  }
);

module.exports = router;
