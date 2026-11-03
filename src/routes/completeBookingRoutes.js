"use strict";
const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");
const router = express.Router();
const validId = value => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
router.patch("/bookings/:id/complete", requireAuth, async (req, res) => {
  try {
    if (req.headers.origin !== (process.env.CLIENT_URL || "http://localhost:3000")) return res.status(403).json({ success:false, message:"Invalid request origin." });
    if (!validId(req.params.id)) return res.status(400).json({ success:false, message:"Invalid booking ID." });
    const db=getDB();
    const booking=await db.collection("bookings").findOne({_id:new ObjectId(req.params.id)});
    if (!booking) return res.status(404).json({success:false,message:"Booking not found."});
    const studioId=String(booking.studioId);
    if(!validId(studioId))return res.status(404).json({success:false,message:"Studio not found."});
    const owned=await db.collection("studios").findOne({_id:new ObjectId(studioId),ownerId:req.user.id},{projection:{_id:1}});
    if(!owned)return res.status(404).json({success:false,message:"Booking not found or not owned by this host."});
    if(booking.status!=="confirmed")return res.status(409).json({success:false,message:"Only confirmed bookings can be completed."});
    const dateTime=new Date(`${booking.date}T${booking.endTime}:00Z`);
    if(Number.isNaN(dateTime.getTime())||dateTime.getTime()>Date.now())return res.status(409).json({success:false,message:"Complete the booking only after the scheduled end time (UTC)."});
    const result=await db.collection("bookings").updateOne({_id:booking._id,status:"confirmed"},{$set:{status:"completed",completedAt:new Date(),updatedAt:new Date()}});
    if(!result.modifiedCount)return res.status(409).json({success:false,message:"Booking was updated by another request."});
    return res.json({success:true,message:"Booking completed successfully."});
  }catch(error){console.error("Complete booking error:",error);return res.status(500).json({success:false,message:"Unable to complete booking."});}
});
module.exports=router;
