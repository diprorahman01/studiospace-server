
const express = require("express");
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

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validImage(value) {
  if (typeof value !== "string") return false;

  const image = value.trim();

  // Uploaded or local public image path
  if (
    image.startsWith("/") &&
    !image.startsWith("//") &&
    !image.includes("\\") &&
    !image.includes("..")
  ) {
    return true;
  }

  // External image URL
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

router.post("/", requireAuth, async (req, res) => {
  try {
    // Basic origin check for cookie-authenticated requests
    const allowedOrigin =
      process.env.CLIENT_URL || "http://localhost:3000";

    if (req.headers.origin !== allowedOrigin) {
      return res.status(403).json({
        success: false,
        message: "Invalid request origin.",
      });
    }

    const body = req.body;

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio information.",
      });
    }

    const title = cleanText(body.title);
    const category = cleanText(body.category);
    const location = cleanText(body.location);
    const overview = cleanText(body.overview);
    const image = cleanText(body.image);

    const hourlyRate = body.hourlyRate;
    const securityDeposit = body.securityDeposit;
    const maxCapacity = body.maxCapacity;

    // Studio name
    if (title.length < 5 || title.length > 120) {
      return res.status(400).json({
        success: false,
        message: "Studio name must be 5–120 characters.",
      });
    }

    // Category
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid studio category.",
      });
    }

    // Location
    if (location.length < 3 || location.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Location must be 3–150 characters.",
      });
    }

    // Description
    if (overview.length < 30 || overview.length > 3000) {
      return res.status(400).json({
        success: false,
        message:
          "Studio description must be 30–3000 characters.",
      });
    }

    // Hourly rate
    if (
      typeof hourlyRate !== "number" ||
      !Number.isFinite(hourlyRate) ||
      hourlyRate <= 0 ||
      hourlyRate > 100000
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid hourly rate.",
      });
    }

    // Security deposit
    if (
      typeof securityDeposit !== "number" ||
      !Number.isFinite(securityDeposit) ||
      securityDeposit < 0 ||
      securityDeposit > 1000000
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid security deposit.",
      });
    }

    // Maximum capacity
    if (
      !Number.isInteger(maxCapacity) ||
      maxCapacity < 1 ||
      maxCapacity > 500
    ) {
      return res.status(400).json({
        success: false,
        message: "Maximum capacity must be 1–500.",
      });
    }

    // Main image
    if (!validImage(image) || image.length > 2048) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid studio image URL.",
      });
    }

    // Additional images
    const images =
      body.images === undefined ? [image] : body.images;

    if (
      !Array.isArray(images) ||
      images.length < 1 ||
      images.length > 10 ||
      !images.every(
        (item) =>
          validImage(item) &&
          item.trim().length <= 2048
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide 1–10 valid studio images.",
      });
    }

    // Amenities
    const amenities =
      body.amenities === undefined ? [] : body.amenities;

    if (
      !Array.isArray(amenities) ||
      amenities.length > 30 ||
      !amenities.every(
        (item) =>
          typeof item === "string" &&
          item.trim().length >= 2 &&
          item.trim().length <= 80
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid amenities.",
      });
    }

    const db = getDB();

    const now = new Date();

    const studio = {
      title,
      category,
      location,
      overview,

      hourlyRate,
      securityDeposit,
      maxCapacity,

      image,
      images: [...new Set(images.map((item) => item.trim()))],
      amenities: [
        ...new Set(amenities.map((item) => item.trim())),
      ],

      // Ownership is always obtained from verified session
      ownerId: req.user.id,
      ownerName: req.user.name,
      ownerEmail: req.user.email,

      rating: 0,
      reviewCount: 0,

      status: "active",

      createdAt: now,
      updatedAt: now,
    };

    const result = await db
      .collection("studios")
      .insertOne(studio);

    return res.status(201).json({
      success: true,
      message: "Studio created successfully!",
      data: {
        ...studio,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Create studio error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create studio.",
    });
  }
});

module.exports = router;
