
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");

const router = express.Router();

// GET all studios
router.get("/", async (req, res) => {
  try {
    const db = getDB();

    const studios = await db
      .collection("studios")
      .find({
  $or: [
    { status: "active" },
    { status: { $exists: false } },
    { status: null },
  ],
})
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: studios.length,
      data: studios,
    });
  } catch (error) {
    console.error("Error fetching studios:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch studios",
    });
  }
});

// GET six featured studios
router.get("/featured", async (req, res) => {
  try {
    const db = getDB();

    const studios = await db
      .collection("studios")
      .find({
  $or: [
    { status: "active" },
    { status: { $exists: false } },
    { status: null },
  ],
})
      .sort({ rating: -1, createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({
      success: true,
      count: studios.length,
      data: studios,
    });
  } catch (error) {
    console.error("Error fetching featured studios:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch featured studios",
    });
  }
});

// GET studio details
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const db = getDB();

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(id),
    });

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: "Studio not found",
      });
    }

    res.status(200).json({
      success: true,
      data: studio,
    });
  } catch (error) {
    console.error("Error fetching studio details:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch studio details",
    });
  }
});

module.exports = router;
