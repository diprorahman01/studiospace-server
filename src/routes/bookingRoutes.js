
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

const OPEN_MINUTES = 8 * 60;
const CLOSE_MINUTES = 20 * 60;
const SLOT_MINUTES = 30;

function validObjectId(id) {
  return (
    typeof id === "string" &&
    /^[a-fA-F0-9]{24}$/.test(id)
  );
}

function toMinutes(time) {
  if (
    typeof time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(
    mins
  ).padStart(2, "0")}`;
}

function validDate(date) {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function isStudioBookable(studio) {
  if (!studio || studio.isDemo === true) {
    return false;
  }

  if (
    studio.status != null &&
    studio.status !== "active"
  ) {
    return false;
  }

  return true;
}

// ==========================================
// GET /api/bookings/availability/:studioId
// Query parameter: ?date=YYYY-MM-DD
// Public availability, no personal details.
// ==========================================

router.get(
  "/availability/:studioId",
  async (req, res) => {
    try {
      const { studioId } = req.params;
      const { date } = req.query;

      if (!validObjectId(studioId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid studio ID.",
        });
      }

      if (!validDate(date)) {
        return res.status(400).json({
          success: false,
          message: "Select a valid booking date.",
        });
      }

      const db = getDB();

      const studio = await db
        .collection("studios")
        .findOne({
          _id: new ObjectId(studioId),
        });

      if (!studio) {
        return res.status(404).json({
          success: false,
          message: "Studio not found.",
        });
      }

      const bookable = isStudioBookable(studio);

      let reservations = [];

      if (bookable) {
        reservations = await db
          .collection("bookings")
          .find(
            {
              studioId: studio._id,
              date,
              status: {
                $in: ["pending", "confirmed"],
              },
            },
            {
              projection: {
                _id: 0,
                startMinutes: 1,
                endMinutes: 1,
              },
            }
          )
          .toArray();
      }

      const slots = [];

      const currentDay = todayUTC();
      const now = new Date();

      const currentUTCMinutes =
        now.getUTCHours() * 60 +
        now.getUTCMinutes();

      for (
        let start = OPEN_MINUTES;
        start < CLOSE_MINUTES;
        start += SLOT_MINUTES
      ) {
        const end = start + SLOT_MINUTES;

        const booked = reservations.some(
          (booking) =>
            typeof booking.startMinutes === "number" &&
            typeof booking.endMinutes === "number" &&
            booking.startMinutes < end &&
            booking.endMinutes > start
        );

        // Dates and stored booking times currently use
        // the existing server's UTC-based date policy.
        const past =
          date < currentDay ||
          (date === currentDay &&
            start <= currentUTCMinutes);

        slots.push({
          startTime: formatTime(start),
          endTime: formatTime(end),
          available: bookable && !booked && !past,
          reason: !bookable
            ? "unavailable"
            : booked
              ? "reserved"
              : past
                ? "past"
                : null,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Studio availability loaded.",
        data: {
          studioId: String(studio._id),
          date,
          bookable,
          openTime: "08:00",
          closeTime: "20:00",
          slotMinutes: SLOT_MINUTES,
          slots,
        },
      });
    } catch (error) {
      console.error(
        "Get studio availability error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load availability.",
      });
    }
  }
);

// ==========================================
// GET /api/bookings/my
// ==========================================

router.get("/my", requireAuth, async (req, res) => {
  try {
    const db = getDB();

    const bookings = await db
      .collection("bookings")
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    console.error("Get my bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load your bookings.",
    });
  }
});

// ==========================================
// PATCH /api/bookings/:id/cancel
// ==========================================

router.patch(
  "/:id/cancel",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!validObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID.",
        });
      }

      const db = getDB();
      const bookingsCollection =
        db.collection("bookings");

      const result =
        await bookingsCollection.updateOne(
          {
            _id: new ObjectId(id),
            userId: req.user.id,
            status: "pending",
          },
          {
            $set: {
              status: "cancelled",
              cancelledAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );

      if (result.modifiedCount === 1) {
        return res.status(200).json({
          success: true,
          message: "Booking cancelled successfully!",
        });
      }

      const ownedBooking =
        await bookingsCollection.findOne({
          _id: new ObjectId(id),
          userId: req.user.id,
        });

      if (!ownedBooking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found.",
        });
      }

      if (ownedBooking.status === "cancelled") {
        return res.status(409).json({
          success: false,
          message: "This booking is already cancelled.",
        });
      }

      return res.status(409).json({
        success: false,
        message:
          "Only pending bookings can be cancelled.",
      });
    } catch (error) {
      console.error("Cancel booking error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to cancel booking.",
      });
    }
  }
);

// ==========================================
// POST /api/bookings
// ==========================================

router.post(
  "/",
  requireAuth,
  async (req, res) => {
    try {
      const {
        studioId,
        date,
        startTime,
        endTime,
      } = req.body || {};

      if (!validObjectId(studioId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid studio ID.",
        });
      }

      if (!validDate(date)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid booking date.",
        });
      }

      if (date < todayUTC()) {
        return res.status(400).json({
          success: false,
          message:
            "Booking date cannot be in the past.",
        });
      }

      const start = toMinutes(startTime);
      const end = toMinutes(endTime);

      if (
        start === null ||
        end === null ||
        start < OPEN_MINUTES ||
        end > CLOSE_MINUTES ||
        end <= start ||
        start % SLOT_MINUTES !== 0 ||
        end % SLOT_MINUTES !== 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Select a valid time between 8 AM and 8 PM.",
        });
      }

      // Match the availability API's treatment
      // of elapsed times on the current UTC date.
      const now = new Date();

      const currentUTCMinutes =
        now.getUTCHours() * 60 +
        now.getUTCMinutes();

      if (
        date === todayUTC() &&
        start <= currentUTCMinutes
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please choose a future start time.",
        });
      }

      const duration = (end - start) / 60;

      const db = getDB();
      const studiosCollection =
        db.collection("studios");
      const bookingsCollection =
        db.collection("bookings");

      const studio =
        await studiosCollection.findOne({
          _id: new ObjectId(studioId),
        });

      if (!studio) {
        return res.status(404).json({
          success: false,
          message: "Studio not found.",
        });
      }

      if (!isStudioBookable(studio)) {
        return res.status(403).json({
          success: false,
          message:
            "This studio is not currently available for booking.",
        });
      }

      const hourlyRate = studio.hourlyRate;
      const securityDeposit =
        studio.securityDeposit ?? 0;

      if (
        !Number.isFinite(hourlyRate) ||
        hourlyRate < 0 ||
        !Number.isFinite(securityDeposit) ||
        securityDeposit < 0
      ) {
        return res.status(500).json({
          success: false,
          message:
            "Studio pricing is not configured correctly.",
        });
      }

      const existingBooking =
        await bookingsCollection.findOne({
          studioId: studio._id,
          date,
          status: {
            $in: ["pending", "confirmed"],
          },
          startMinutes: { $lt: end },
          endMinutes: { $gt: start },
        });

      if (existingBooking) {
        return res.status(409).json({
          success: false,
          message:
            "This studio is already booked for that time.",
        });
      }

      const rentalCost =
        Math.round(
          duration * hourlyRate * 100
        ) / 100;

      const totalAmount =
        Math.round(
          (rentalCost + securityDeposit) * 100
        ) / 100;

      const booking = {
        studioId: studio._id,
        studioTitle: studio.title,
        studioImage: studio.image,

        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,

        date,
        startTime,
        endTime,
        startMinutes: start,
        endMinutes: end,
        duration,

        hourlyRate,
        rentalCost,
        securityDeposit,
        totalAmount,

        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result =
        await bookingsCollection.insertOne(booking);

      return res.status(201).json({
        success: true,
        message:
          "Booking request submitted successfully!",
        data: {
          ...booking,
          _id: result.insertedId,
        },
      });
    } catch (error) {
      console.error(
        "Create booking error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to create booking.",
      });
    }
  }
);

module.exports = router;
