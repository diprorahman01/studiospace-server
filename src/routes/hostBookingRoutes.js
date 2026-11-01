
const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

// GET /api/host/bookings
// Retrieve bookings received by studios owned by
// the authenticated user.

router.get("/bookings", requireAuth, async (req, res) => {
  try {
    const db = getDB();

    const studiosCollection = db.collection("studios");
    const bookingsCollection = db.collection("bookings");

    const ownerId = req.user.id;

    // Step 1: Find studios owned by this user.
    // Never accept ownerId from request parameters.
    const ownerStudios = await studiosCollection
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

    // Your existing bookings store studioId
    // as a string. Support ObjectId values too.
    const studioIds = ownerStudios.flatMap(
      (studio) => [
        studio._id.toString(),
        new ObjectId(studio._id),
      ]
    );

    // Step 2: Retrieve only bookings associated
    // with the owner's studios.
    const bookings = await bookingsCollection
      .find(
        {
          studioId: {
            $in: studioIds,
          },
        },
        {
          projection: {
            studioId: 1,
            studioTitle: 1,
            studioImage: 1,
            userId: 1,
            userName: 1,
            userEmail: 1,
            date: 1,
            startTime: 1,
            endTime: 1,
            duration: 1,
            hourlyRate: 1,
            rentalCost: 1,
            securityDeposit: 1,
            totalAmount: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            cancelledAt: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .toArray();

    // Step 3: Attach current studio information
    // for convenient frontend rendering.
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

    const summary = {
      total: data.length,
      pending: data.filter(
        (booking) => booking.status === "pending"
      ).length,
      confirmed: data.filter(
        (booking) => booking.status === "confirmed"
      ).length,
      cancelled: data.filter(
        (booking) => booking.status === "cancelled"
      ).length,
    };

    return res.status(200).json({
      success: true,
      message: "Host bookings loaded successfully.",
      summary,
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

module.exports = router;
