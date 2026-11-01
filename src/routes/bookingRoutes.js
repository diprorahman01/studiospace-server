
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

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

// GET /api/bookings/my
// Return bookings belonging to the logged-in user
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

// POST /api/bookings
// Create a booking for the logged-in user
router.post("/", requireAuth, async (req, res) => {
  try {
    const { studioId, date, startTime, endTime } = req.body;

    if (
      typeof studioId !== "string" ||
      !ObjectId.isValid(studioId) ||
      new ObjectId(studioId).toHexString() !== studioId.toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID.",
      });
    }

    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid booking date.",
      });
    }

    const selectedDate = new Date(`${date}T00:00:00Z`);

    if (
      Number.isNaN(selectedDate.getTime()) ||
      selectedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid calendar date.",
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    if (date < today) {
      return res.status(400).json({
        success: false,
        message: "Booking date cannot be in the past.",
      });
    }

    const start = toMinutes(startTime);
    const end = toMinutes(endTime);

    if (
      start === null ||
      end === null ||
      start < 8 * 60 ||
      end > 20 * 60 ||
      end <= start ||
      start % 30 !== 0 ||
      end % 30 !== 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Select a valid time between 8 AM and 8 PM.",
      });
    }

    const duration = (end - start) / 60;

    if (duration < 0.5) {
      return res.status(400).json({
        success: false,
        message: "Minimum booking duration is 30 minutes.",
      });
    }

    const db = getDB();

    const studiosCollection = db.collection("studios");
    const bookingsCollection = db.collection("bookings");

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(studioId),
    });

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: "Studio not found.",
      });
    }

    const hourlyRate = studio.hourlyRate;
    const securityDeposit = studio.securityDeposit ?? 0;

    if (
      !Number.isFinite(hourlyRate) ||
      hourlyRate < 0 ||
      !Number.isFinite(securityDeposit) ||
      securityDeposit < 0
    ) {
      return res.status(500).json({
        success: false,
        message: "Studio pricing is not configured correctly.",
      });
    }

    // Check overlapping pending or confirmed bookings
    const existingBooking = await bookingsCollection.findOne({
      studioId: studio._id,
      date,
      status: { $in: ["pending", "confirmed"] },
      startMinutes: { $lt: end },
      endMinutes: { $gt: start },
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: "This studio is already booked for that time.",
      });
    }

    const rentalCost =
      Math.round(duration * hourlyRate * 100) / 100;

    const totalAmount =
      Math.round((rentalCost + securityDeposit) * 100) / 100;

    const booking = {
      studioId: studio._id,
      studioTitle: studio.title,
      studioImage: studio.image,

      // Identity comes from verified session, not request body
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

    const result = await bookingsCollection.insertOne(booking);

    return res.status(201).json({
      success: true,
      message: "Booking request submitted successfully!",
      data: {
        ...booking,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Create booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create booking.",
    });
  }
});

module.exports = router;
