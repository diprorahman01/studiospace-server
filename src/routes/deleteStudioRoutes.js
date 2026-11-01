
const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

// DELETE /api/studios/:id
// Only the authenticated owner can delete a studio.
// Deletion is blocked if active reservations exist.

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const CLIENT_URL =
      process.env.CLIENT_URL || "http://localhost:3000";

    // Protect cookie-authenticated requests from
    // unauthorized cross-origin requests.
    if (req.headers.origin !== CLIENT_URL) {
      return res.status(403).json({
        success: false,
        message: "Invalid request origin.",
      });
    }

    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (
      typeof id !== "string" ||
      !/^[a-fA-F0-9]{24}$/.test(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID.",
      });
    }

    const db = getDB();

    const studiosCollection = db.collection("studios");
    const bookingsCollection = db.collection("bookings");

    const studioObjectId = new ObjectId(id);

    // Ownership must come from the authenticated session.
    const ownerFilter = {
      _id: studioObjectId,
      ownerId: req.user.id,
    };

    const studio = await studiosCollection.findOne(
      ownerFilter
    );

    if (!studio) {
      return res.status(404).json({
        success: false,
        message:
          "Studio not found or you do not have permission to delete it.",
      });
    }

    // Existing bookings store studioId as a string.
    // Check both common ID representations for safety.
    const activeBookings = await bookingsCollection.countDocuments({
      studioId: {
        $in: [studioObjectId.toString(), studioObjectId],
      },
      status: {
        $in: ["pending", "confirmed"],
      },
    });

    if (activeBookings > 0) {
      return res.status(409).json({
        success: false,
        message:
          "This studio has pending or confirmed bookings. Resolve those bookings before deleting the studio.",
        activeBookings,
      });
    }

    // The owner filter is repeated in deleteOne.
    // This prevents deletion of another user's studio.
    const result = await studiosCollection.deleteOne(
      ownerFilter
    );

    if (result.deletedCount !== 1) {
      return res.status(404).json({
        success: false,
        message:
          "Studio could not be found or has already been deleted.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Studio deleted successfully.",
      deletedStudioId: studioObjectId.toString(),
    });
  } catch (error) {
    console.error("Delete studio error:", error);

    return res.status(500).json({
      success: false,
      message:
        "An error occurred while deleting the studio.",
    });
  }
});

module.exports = router;
