
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

function validateCoordinates(value) {
  // Coordinates are optional for existing workflows.
  if (value === undefined || value === null) {
    return { coordinates: null };
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {
      error: "Provide valid map coordinates.",
    };
  }

  const keys = Object.keys(value);

  if (
    keys.length !== 2 ||
    !keys.includes("latitude") ||
    !keys.includes("longitude")
  ) {
    return {
      error:
        "Provide both latitude and longitude.",
    };
  }

  const { latitude, longitude } = value;

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    return {
      error: "Latitude must be between -90 and 90.",
    };
  }

  if (
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return {
      error:
        "Longitude must be between -180 and 180.",
    };
  }

  return {
    coordinates: { latitude, longitude },
  };
}

// POST /api/studios
router.post("/", requireAuth, async (req, res) => {
  try {
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

    // Optional exact address
    if (
      body.fullAddress !== undefined &&
      typeof body.fullAddress !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Full address must be text.",
      });
    }

    const fullAddress = cleanText(body.fullAddress);

    if (fullAddress.length > 300) {
      return res.status(400).json({
        success: false,
        message:
          "Full address must be 300 characters or fewer.",
      });
    }

    // Optional map coordinates
    const coordinateValidation =
      validateCoordinates(body.coordinates);

    if (coordinateValidation.error) {
      return res.status(400).json({
        success: false,
        message: coordinateValidation.error,
      });
    }

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
    if (!validImage(image)) {
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
      !images.every(validImage)
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
      fullAddress,
      coordinates: coordinateValidation.coordinates,
      overview,

      hourlyRate,
      securityDeposit,
      maxCapacity,

      image,
      images: [
        ...new Set(images.map((item) => item.trim())),
      ],
      amenities: [
        ...new Set(amenities.map((item) => item.trim())),
      ],

      // Ownership comes from verified session.
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
