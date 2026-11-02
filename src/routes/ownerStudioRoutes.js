
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:3000";

function canManageAvailability(studio) {
  return (
    studio.isDemo !== true &&
    (studio.status == null ||
      ["active", "inactive"].includes(studio.status))
  );
}

// GET /api/studios/mine
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const db = getDB();

    const studios = await db
      .collection("studios")
      .find({ ownerId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    const active = studios.filter(
      (studio) =>
        canManageAvailability(studio) &&
        studio.status !== "inactive"
    ).length;

    const inactive = studios.filter(
      (studio) => studio.status === "inactive"
    ).length;

    return res.status(200).json({
      success: true,
      message: "Your studios loaded successfully.",
      count: studios.length,
      summary: {
        total: studios.length,
        active,
        inactive,
      },
      data: studios,
    });
  } catch (error) {
    console.error("Get owner studios error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load your studio listings.",
    });
  }
});

// PATCH /api/studios/:id/availability
// Only a verified owner can update their real studio.
router.patch(
  "/:id/availability",
  requireAuth,
  async (req, res) => {
    try {
      if (req.headers.origin !== CLIENT_URL) {
        return res.status(403).json({
          success: false,
          message: "Invalid request origin.",
        });
      }

      const { id } = req.params;
      const { status } = req.body || {};

      if (!/^[a-fA-F0-9]{24}$/.test(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid studio ID.",
        });
      }

      if (status !== "active" && status !== "inactive") {
        return res.status(400).json({
          success: false,
          message: "Status must be active or inactive.",
        });
      }

      const db = getDB();
      const studios = db.collection("studios");

      const ownedStudio = await studios.findOne({
        _id: new ObjectId(id),
        ownerId: req.user.id,
      });

      if (!ownedStudio) {
        return res.status(404).json({
          success: false,
          message:
            "Studio not found or you do not own it.",
        });
      }

      if (!canManageAvailability(ownedStudio)) {
        return res.status(403).json({
          success: false,
          message:
            "This demo, draft, or restricted studio cannot be activated by its host.",
        });
      }

      // Keep ownership and listing eligibility checks
      // inside the actual database update as well.
      const filter = {
        _id: ownedStudio._id,
        ownerId: req.user.id,
        isDemo: { $ne: true },
        $or: [
          { status: { $in: ["active", "inactive"] } },
          { status: { $exists: false } },
          { status: null },
        ],
      };

      const result = await studios.updateOne(filter, {
        $set: {
          status,
          updatedAt: new Date(),
        },
      });

      if (result.matchedCount !== 1) {
        return res.status(409).json({
          success: false,
          message:
            "The listing changed. Refresh and try again.",
        });
      }

      const updatedStudio = await studios.findOne({
        _id: ownedStudio._id,
        ownerId: req.user.id,
      });

      return res.status(200).json({
        success: true,
        message:
          status === "active"
            ? "Studio is now available for booking."
            : "Studio is now unavailable for new bookings.",
        data: updatedStudio,
      });
    } catch (error) {
      console.error(
        "Update studio availability error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Unable to update studio availability.",
      });
    }
  }
);

module.exports = router;
