
const express = require("express");

const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

// GET /api/studios/mine
// Get studios owned by the currently logged-in user.

router.get("/mine", requireAuth, async (req, res) => {
  try {
    const db = getDB();

    // The user ID comes from the verified Better Auth session.
    // It is not taken from the query string or request body.
    const ownerId = req.user.id;

    const studios = await db
      .collection("studios")
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .toArray();

    const activeCount = studios.filter(
      (studio) => studio.status === "active"
    ).length;

    const inactiveCount = studios.filter(
      (studio) => studio.status === "inactive"
    ).length;

    return res.status(200).json({
      success: true,
      message: "Your studios loaded successfully.",
      count: studios.length,
      summary: {
        total: studios.length,
        active: activeCount,
        inactive: inactiveCount,
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

module.exports = router;
