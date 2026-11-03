"use strict";
require("dotenv").config();
const { connectDB, closeDB } = require("../src/config/db");
(async () => {
  try {
    const db=await connectDB();
    const indexes=await db.collection("bookings").indexes();
    const index=indexes.find(item=>item.name==="unique_active_studio_booking_slots");
    if (!index || !index.unique || !index.key?.occupiedSlots) {
      console.error("FAIL: unique active booking slot index is not installed.");
      console.error("Run: node scripts/enableAtomicBookingSlots.js");
      process.exitCode=1;
    } else {
      console.log("PASS: unique active booking slot index exists.",index.key);
    }
    const favoriteIndexes=await db.collection("userFavorites").indexes().catch(()=>[]);
    console.log("Wishlist index status:",favoriteIndexes.some(i=>i.unique&&i.key?.userId===1)?"PASS":"NOT INSTALLED / restart server to create");
    const reviewIndexes=await db.collection("studioReviews").indexes().catch(()=>[]);
    console.log("Review index status:",reviewIndexes.some(i=>i.unique&&i.key?.bookingId===1)?"PASS":"NOT INSTALLED / restart server to create");
    console.log("Authentication: Better Auth session cookie must be checked in browser DevTools for HttpOnly and Secure attributes.");
    console.log("JWT note: Better Auth session cookies are not automatically JWTs. Check the exact assignment challenge with your examiner.");
  } catch(e){console.error("Security check failed:",e);process.exitCode=1;}
  finally{await closeDB().catch(console.error);}
})();
