
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

const OPEN_MINUTES = 480;
const CLOSE_MINUTES = 1200;
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
  return `${String(Math.floor(minutes / 60)).padStart(
    2,
    "0"
  )}:${String(minutes % 60).padStart(2, "0")}`;
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
  return (
    studio &&
    studio.isDemo !== true &&
    (studio.status == null || studio.status === "active")
  );
}

function createOccupiedSlots(start, end) {
  const slots = [];
  for (
    let minute = start;
    minute < end;
    minute += SLOT_MINUTES
  ) {
    slots.push(minute);
  }
  return slots;
}

function duplicateSlotError(error) {
  return error?.code === 11000;
}

function validateSchedule(date, startTime, endTime) {
  if (!validDate(date)) {
    return "Please provide a valid booking date.";
  }

  const today = todayUTC();

  if (date < today) {
    return "Booking date cannot be in the past.";
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
    return "Select a valid time between 8 AM and 8 PM.";
  }

  const now = new Date();

  const currentUTCMinutes =
    now.getUTCHours() * 60 + now.getUTCMinutes();

  if (date === today && start <= currentUTCMinutes) {
    return "Please choose a future start time.";
  }

  return null;
}

async function hasConflict(
  bookingsCollection,
  studioId,
  date,
  start,
  end,
  excludeId = null
) {
  const filter = {
    studioId,
    date,
    status: { $in: ["pending", "confirmed"] },
    startMinutes: { $lt: end },
    endMinutes: { $gt: start },
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  return Boolean(
    await bookingsCollection.findOne(filter, {
      projection: { _id: 1 },
    })
  );
}

function calculatePrices(duration, studio) {
  const hourlyRate = studio.hourlyRate;
  const securityDeposit = studio.securityDeposit ?? 0;

  if (
    !Number.isFinite(hourlyRate) ||
    hourlyRate < 0 ||
    !Number.isFinite(securityDeposit) ||
    securityDeposit < 0
  ) {
    return null;
  }

  const rentalCost =
    Math.round(duration * hourlyRate * 100) / 100;

  const totalAmount =
    Math.round((rentalCost + securityDeposit) * 100) / 100;

  return {
    hourlyRate,
    securityDeposit,
    rentalCost,
    totalAmount,
  };
}

// ==========================================
// GET /api/bookings/availability/:studioId
// ==========================================

router.get("/availability/:studioId", async (req, res) => {
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
    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(studioId),
    });

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: "Studio not found.",
      });
    }

    const bookable = isStudioBookable(studio);

    const reservations = bookable
      ? await db
          .collection("bookings")
          .find(
            {
              studioId: studio._id,
              date,
              status: { $in: ["pending", "confirmed"] },
            },
            {
              projection: {
                _id: 0,
                startMinutes: 1,
                endMinutes: 1,
              },
            }
          )
          .toArray()
      : [];

    const now = new Date();
    const currentDay = todayUTC();
    const currentUTCMinutes =
      now.getUTCHours() * 60 + now.getUTCMinutes();

    const slots = [];

    for (
      let start = OPEN_MINUTES;
      start < CLOSE_MINUTES;
      start += SLOT_MINUTES
    ) {
      const end = start + SLOT_MINUTES;

      const booked = reservations.some(
        (booking) =>
          booking.startMinutes < end &&
          booking.endMinutes > start
      );

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
    console.error("Availability error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load availability.",
    });
  }
});

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

router.patch("/:id/cancel", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!validObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const db = getDB();
    const collection = db.collection("bookings");

    const result = await collection.updateOne(
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

    const ownedBooking = await collection.findOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    if (!ownedBooking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    return res.status(409).json({
      success: false,
      message:
        ownedBooking.status === "cancelled"
          ? "This booking is already cancelled."
          : "Only pending bookings can be cancelled.",
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking.",
    });
  }
});

// ==========================================
// PATCH /api/bookings/:id/reschedule
// Pending bookings only; same studio.
// ==========================================

router.patch(
  "/:id/reschedule",
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { date, startTime, endTime } = req.body || {};

      if (!validObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID.",
        });
      }

      const scheduleError = validateSchedule(
        date,
        startTime,
        endTime
      );

      if (scheduleError) {
        return res.status(400).json({
          success: false,
          message: scheduleError,
        });
      }

      const db = getDB();
      const bookings = db.collection("bookings");
      const bookingId = new ObjectId(id);

      const booking = await bookings.findOne({
        _id: bookingId,
        userId: req.user.id,
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found.",
        });
      }

      if (booking.status !== "pending") {
        return res.status(409).json({
          success: false,
          message:
            "Only pending bookings can be rescheduled.",
        });
      }

      if (
        booking.date === date &&
        booking.startTime === startTime &&
        booking.endTime === endTime
      ) {
        return res.status(400).json({
          success: false,
          message: "Please select a different date or time.",
        });
      }

      const studioId = booking.studioId;

      if (!validObjectId(String(studioId))) {
        return res.status(400).json({
          success: false,
          message: "Booking studio ID is invalid.",
        });
      }

      const studio = await db
        .collection("studios")
        .findOne({
          _id: new ObjectId(String(studioId)),
        });

      if (!studio || !isStudioBookable(studio)) {
        return res.status(403).json({
          success: false,
          message:
            "This studio is not accepting reservations.",
        });
      }

      const start = toMinutes(startTime);
      const end = toMinutes(endTime);
      const duration = (end - start) / 60;

      const prices = calculatePrices(duration, studio);

      if (!prices) {
        return res.status(500).json({
          success: false,
          message: "Studio pricing is invalid.",
        });
      }

      const conflict = await hasConflict(
        bookings,
        studio._id,
        date,
        start,
        end,
        bookingId
      );

      if (conflict) {
        return res.status(409).json({
          success: false,
          message:
            "Another booking already occupies this time.",
        });
      }

      const now = new Date();

      const updates = {
        date,
        startTime,
        endTime,
        startMinutes: start,
        endMinutes: end,
        occupiedSlots: createOccupiedSlots(start, end),
        duration,
        ...prices,
        updatedAt: now,
        rescheduledAt: now,
      };

      let result;

      try {
        // Atomic status and previous-schedule check.
        // A competing cancellation, host approval,
        // or reschedule makes matchedCount zero.
        result = await bookings.updateOne(
          {
            _id: bookingId,
            userId: req.user.id,
            status: "pending",
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
          },
          { $set: updates }
        );
      } catch (error) {
        if (duplicateSlotError(error)) {
          return res.status(409).json({
            success: false,
            message:
              "Those time slots were just reserved. Please choose another time.",
          });
        }
        throw error;
      }

      if (result.matchedCount !== 1) {
        return res.status(409).json({
          success: false,
          message:
            "This booking was changed by another request. Refresh and try again.",
        });
      }

      const updatedBooking = await bookings.findOne({
        _id: bookingId,
        userId: req.user.id,
      });

      return res.status(200).json({
        success: true,
        message: "Booking rescheduled successfully!",
        data: updatedBooking,
      });
    } catch (error) {
      console.error("Reschedule booking error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to reschedule the booking.",
      });
    }
  }
);

// ==========================================
// POST /api/bookings
// ==========================================

router.post("/", requireAuth, async (req, res) => {
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

    const scheduleError = validateSchedule(
      date,
      startTime,
      endTime
    );

    if (scheduleError) {
      return res.status(400).json({
        success: false,
        message: scheduleError,
      });
    }

    const db = getDB();
    const studios = db.collection("studios");
    const bookings = db.collection("bookings");

    const studio = await studios.findOne({
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

    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    const duration = (end - start) / 60;

    const prices = calculatePrices(duration, studio);

    if (!prices) {
      return res.status(500).json({
        success: false,
        message: "Studio pricing is invalid.",
      });
    }

    if (
      await hasConflict(
        bookings,
        studio._id,
        date,
        start,
        end
      )
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This studio is already booked for that time.",
      });
    }

    const now = new Date();

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
      occupiedSlots: createOccupiedSlots(start, end),
      duration,
      ...prices,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    try {
      const result = await bookings.insertOne(booking);

      return res.status(201).json({
        success: true,
        message: "Booking request submitted successfully!",
        data: {
          ...booking,
          _id: result.insertedId,
        },
      });
    } catch (error) {
      if (duplicateSlotError(error)) {
        return res.status(409).json({
          success: false,
          message:
            "Some time slots were just reserved. Please refresh availability.",
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("Create booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create booking.",
    });
  }
});

module.exports = router;
