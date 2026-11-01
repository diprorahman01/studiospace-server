
const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

const ALLOWED_CATEGORIES = [
  "Photo Studio",
  "Podcast Lounge",
  "Music Suite",
  "Film Stage",
  "Creative Workspace",
  "Art Workshop",
];

const ALLOWED_FIELDS = [
  "title",
  "category",
  "location",
  "overview",
  "hourlyRate",
  "securityDeposit",
  "maxCapacity",
  "image",
  "images",
  "amenities",
];

function validImage(value) {
  if (typeof value !== "string") return false;

  const image = value.trim();

  if (!image || image.length > 2048) return false;

  if (
    image.startsWith("/") &&
    !image.startsWith("//") &&
    !image.includes("\\") &&
    !image.includes("..")
  ) {
    return true;
  }

  try {
    const url = new URL(image);

    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function validateUpdate(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return { error: "Invalid studio information." };
  }

  const keys = Object.keys(body);

  if (keys.length === 0) {
    return { error: "Provide at least one field to update." };
  }

  // Prevent updates to ownerId, rating, status, etc.
  const unknownField = keys.find(
    (key) => !ALLOWED_FIELDS.includes(key)
  );

  if (unknownField) {
    return {
      error: `You cannot update the field: ${unknownField}`,
    };
  }

  const updates = {};

  for (const key of keys) {
    const value = body[key];

    if (
      ["title", "category", "location", "overview", "image"].includes(
        key
      )
    ) {
      if (typeof value !== "string") {
        return { error: `${key} must be text.` };
      }

      updates[key] = value.trim();
    } else if (key === "images" || key === "amenities") {
      updates[key] = value;
    } else {
      updates[key] = value;
    }
  }

  if (
    "title" in updates &&
    (updates.title.length < 5 || updates.title.length > 120)
  ) {
    return { error: "Studio name must be 5–120 characters." };
  }

  if (
    "category" in updates &&
    !ALLOWED_CATEGORIES.includes(updates.category)
  ) {
    return { error: "Please select a valid category." };
  }

  if (
    "location" in updates &&
    (updates.location.length < 3 ||
      updates.location.length > 150)
  ) {
    return { error: "Location must be 3–150 characters." };
  }

  if (
    "overview" in updates &&
    (updates.overview.length < 30 ||
      updates.overview.length > 3000)
  ) {
    return {
      error: "Description must be 30–3000 characters.",
    };
  }

  if (
    "hourlyRate" in updates &&
    (typeof updates.hourlyRate !== "number" ||
      !Number.isFinite(updates.hourlyRate) ||
      updates.hourlyRate <= 0 ||
      updates.hourlyRate > 100000)
  ) {
    return { error: "Enter a valid hourly rate." };
  }

  if (
    "securityDeposit" in updates &&
    (typeof updates.securityDeposit !== "number" ||
      !Number.isFinite(updates.securityDeposit) ||
      updates.securityDeposit < 0 ||
      updates.securityDeposit > 1000000)
  ) {
    return { error: "Enter a valid security deposit." };
  }

  if (
    "maxCapacity" in updates &&
    (!Number.isInteger(updates.maxCapacity) ||
      updates.maxCapacity < 1 ||
      updates.maxCapacity > 500)
  ) {
    return { error: "Maximum capacity must be 1–500." };
  }

  if ("image" in updates && !validImage(updates.image)) {
    return { error: "Provide a valid main image URL." };
  }

  if ("images" in updates) {
    if (
      !Array.isArray(updates.images) ||
      updates.images.length < 1 ||
      updates.images.length > 10 ||
      !updates.images.every(validImage)
    ) {
      return { error: "Provide 1–10 valid image URLs." };
    }

    updates.images = [
      ...new Set(updates.images.map((item) => item.trim())),
    ];
  }

  if ("amenities" in updates) {
    if (
      !Array.isArray(updates.amenities) ||
      updates.amenities.length > 30 ||
      !updates.amenities.every(
        (item) =>
          typeof item === "string" &&
          item.trim().length >= 2 &&
          item.trim().length <= 80
      )
    ) {
      return { error: "Please provide valid amenities." };
    }

    updates.amenities = [
      ...new Set(updates.amenities.map((item) => item.trim())),
    ];
  }

  // Always update this value on the server.
  updates.updatedAt = new Date();

  return { updates };
}

// PATCH /api/studios/:id
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const allowedOrigin =
      process.env.CLIENT_URL || "http://localhost:3000";

    if (req.headers.origin !== allowedOrigin) {
      return res.status(403).json({
        success: false,
        message: "Invalid request origin.",
      });
    }

    const id = req.params.id;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID.",
      });
    }

    const validation = validateUpdate(req.body);

    if (validation.error) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }

    const db = getDB();
    const collection = db.collection("studios");

    const filter = {
      _id: new ObjectId(id),
      ownerId: req.user.id,
    };

    // Atomic ownership check: only the actual owner can update.
    const result = await collection.updateOne(filter, {
      $set: validation.updates,
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Studio not found or you do not have permission to edit it.",
      });
    }

    const studio = await collection.findOne(filter);

    return res.status(200).json({
      success: true,
      message: "Studio updated successfully!",
      data: studio,
    });
  } catch (error) {
    console.error("Edit studio error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update studio.",
    });
  }
});

module.exports = router;
