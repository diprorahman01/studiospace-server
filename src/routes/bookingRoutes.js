
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

// POST /api/bookings
router.post("/", requireAuth, async (req, res) => {
  try {
    const { studioId, date, startTime, endTime } = req.body;

    // Validate studio ID
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

    // Validate date
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

    // Demo studio hours: 8 AM - 8 PM
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

    // Always calculate the price using MongoDB data
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

    // Check overlapping reservations
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
