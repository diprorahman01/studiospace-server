"use strict";
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");
const makePdf = require("../utils/createBookingPdf");
const router = express.Router();

router.get("/:bookingId", requireAuth, async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.bookingId)) {
      return res.status(400).json({ success: false, message: "Invalid booking reference." });
    }
    const booking = await getDB().collection("bookings").findOne({
      _id: new ObjectId(req.params.bookingId),
      userId: req.user.id,
      status: { $in: ["confirmed", "completed"] },
    });
    if (!booking) return res.status(404).json({ success: false, message: "No eligible confirmed booking was found." });
    const pdf = makePdf(booking);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="studiospace-booking-${req.params.bookingId}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(pdf);
  } catch (error) {
    console.error("Invoice error:", error);
    return res.status(500).json({ success: false, message: "Unable to generate booking PDF." });
  }
});
module.exports = router;
