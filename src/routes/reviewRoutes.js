"use strict";
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");
const router = express.Router();
const validId = (value) => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);

router.get("/studio/:studioId", async (req, res) => {
  try {
    if (!validId(req.params.studioId)) return res.status(400).json({ success: false, message: "Invalid studio ID." });
    const data = await getDB().collection("studioReviews")
      .find({ studioId: req.params.studioId }, { projection: { userId: 0, userEmail: 0 } })
      .sort({ createdAt: -1 }).limit(100).toArray();
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Read reviews error:", error);
    return res.status(500).json({ success: false, message: "Reviews are temporarily unavailable." });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    if (req.headers.origin !== (process.env.CLIENT_URL || "http://localhost:3000")) {
      return res.status(403).json({ success: false, message: "Invalid request origin." });
    }
    const { bookingId, rating, comment } = req.body || {};
    if (!validId(bookingId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || typeof comment !== "string" || comment.trim().length < 15 || comment.trim().length > 1000) {
      return res.status(400).json({ success: false, message: "Enter a 1–5 star rating and a review of 15–1000 characters." });
    }
    const db = getDB();
    const booking = await db.collection("bookings").findOne({ _id: new ObjectId(bookingId), userId: req.user.id, status: "completed" });
    if (!booking) return res.status(403).json({ success: false, message: "Only customers with completed bookings can review a studio." });
    const studioId = String(booking.studioId);
    const studio = await db.collection("studios").findOne({ _id: new ObjectId(studioId) });
    if (!studio) return res.status(404).json({ success: false, message: "Studio not found." });
    if (String(studio.ownerId) === req.user.id) return res.status(403).json({ success: false, message: "Hosts cannot review their own studios." });
    const reviews = db.collection("studioReviews");
    const review = { studioId, bookingId, userId: req.user.id, userName: req.user.name || "Verified customer", rating, comment: comment.trim(), createdAt: new Date() };
    try { await reviews.insertOne(review); }
    catch (error) {
      if (error?.code === 11000) return res.status(409).json({ success: false, message: "You already reviewed this booking." });
      throw error;
    }
    const stats = await reviews.aggregate([{ $match: { studioId } }, { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } }]).toArray();
    if (stats.length) await db.collection("studios").updateOne({ _id: studio._id }, { $set: { rating: Math.round(stats[0].avg * 10) / 10, reviewCount: stats[0].count } });
    return res.status(201).json({ success: true, message: "Review published.", data: { ...review, userId: undefined, _id: review._id } });
  } catch (error) {
    console.error("Create review error:", error);
    return res.status(500).json({ success: false, message: "Unable to publish your review." });
  }
});
module.exports = router;
