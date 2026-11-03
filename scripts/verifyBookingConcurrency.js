"use strict";
/**
 * A controlled integration test against a TEMPORARY MongoDB collection.
 * Does not modify real studios or bookings.
 * The real bookings index must also be installed (checkSubmissionSecurity.js).
 */
require("dotenv").config();
const { randomUUID } = require("node:crypto");
const { connectDB, closeDB } = require("../src/config/db");
async function main() {
  let collection;
  try {
    const db = await connectDB();
    const name = `_studio_booking_index_test_${randomUUID().replace(/-/g, "")}`;
    collection = db.collection(name);
    await collection.createIndex(
      { studioId: 1, date: 1, occupiedSlots: 1 },
      { unique: true, partialFilterExpression: { status: { $in: ["pending", "confirmed"] }, occupiedSlots: { $exists: true } } }
    );
    const studioId = "test-studio";
    const date = "2099-04-03";
    const calls = await Promise.allSettled([
      collection.insertOne({ studioId, date, occupiedSlots: [600, 630], status: "pending" }),
      collection.insertOne({ studioId, date, occupiedSlots: [630, 660], status: "pending" }),
    ]);
    const accepted = calls.filter((x) => x.status === "fulfilled").length;
    const rejected = calls.filter((x) => x.status === "rejected" && x.reason?.code === 11000).length;
    if (accepted !== 1 || rejected !== 1) {
      throw Error(`Expected one accepted and one duplicate-key rejection, got ${accepted}/${rejected}.`);
    }
    // Different time slot should be accepted.
    await collection.insertOne({ studioId, date, occupiedSlots: [690], status: "confirmed" });
    // Cancelled bookings do not reserve slots.
    await collection.insertOne({ studioId, date, occupiedSlots: [630], status: "cancelled" });
    console.log("PASS: concurrent overlapping active bookings cannot both reserve the same slot.");
    console.log("PASS: non-overlapping bookings and cancelled bookings are handled as expected.");
  } catch (error) {
    console.error("FAIL booking index concurrency test:", error);
    process.exitCode = 1;
  } finally {
    if (collection) await collection.drop().catch((error) => console.warn("Could not drop temporary test collection:", error.message));
    await closeDB().catch(console.error);
  }
}
void main();
