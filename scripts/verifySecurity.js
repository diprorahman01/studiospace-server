
"use strict";

require("dotenv").config();

const {
  connectDB,
  closeDB,
} = require("../src/config/db");

const INDEX_NAME = "unique_active_studio_booking_slots";

const ACTIVE_STATUSES = ["pending", "confirmed"];

function getSlots(booking) {
  if (
    !Number.isInteger(booking.startMinutes) ||
    !Number.isInteger(booking.endMinutes) ||
    booking.startMinutes < 480 ||
    booking.endMinutes > 1200 ||
    booking.endMinutes <= booking.startMinutes ||
    booking.startMinutes % 30 !== 0 ||
    booking.endMinutes % 30 !== 0
  ) {
    return null;
  }

  const result = [];

  for (
    let minute = booking.startMinutes;
    minute < booking.endMinutes;
    minute += 30
  ) {
    result.push(minute);
  }

  return result;
}

function sameSlots(first, second) {
  return (
    Array.isArray(first) &&
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function isExpectedIndex(index) {
  if (!index || index.unique !== true) {
    return false;
  }

  const keys = index.key || {};
  const partial = index.partialFilterExpression || {};

  const statuses = partial.status?.$in;

  return (
    keys.studioId === 1 &&
    keys.date === 1 &&
    keys.occupiedSlots === 1 &&
    Array.isArray(statuses) &&
    ACTIVE_STATUSES.every((status) =>
      statuses.includes(status)
    ) &&
    partial.occupiedSlots?.$exists === true
  );
}

async function main() {
  let failed = false;

  try {
    console.log("\nStudioSpace Booking Security Check");
    console.log("===================================");

    const db = await connectDB();

    const bookings = db.collection("bookings");

    const indexes = await bookings.indexes();

    const matchingIndex = indexes.find(
      (index) =>
        index.name === INDEX_NAME &&
        isExpectedIndex(index)
    );

    if (matchingIndex) {
      console.log(
        "PASS: Correct unique active booking-slot index exists."
      );
    } else {
      console.error(
        "FAIL: Unique booking-slot index is missing or incorrectly configured."
      );
      console.error(
        "Inspect existing bookings before running npm run booking:index."
      );
      failed = true;
    }

    const activeBookings = await bookings
      .find(
        {
          status: {
            $in: ACTIVE_STATUSES,
          },
        },
        {
          projection: {
            _id: 1,
            studioId: 1,
            date: 1,
            status: 1,
            startMinutes: 1,
            endMinutes: 1,
            occupiedSlots: 1,
          },
        }
      )
      .toArray();

    console.log(
      `Checking ${activeBookings.length} active bookings...`
    );

    const occupied = new Map();

    let invalidRecords = 0;
    let overlaps = 0;

    for (const booking of activeBookings) {
      const expectedSlots = getSlots(booking);

      if (
        !booking.studioId ||
        typeof booking.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(booking.date) ||
        !expectedSlots ||
        !sameSlots(booking.occupiedSlots, expectedSlots)
      ) {
        invalidRecords += 1;

        console.error(
          `INVALID BOOKING: ${booking._id}`
        );

        continue;
      }

      for (const slot of expectedSlots) {
        const key = [
          String(booking.studioId),
          booking.date,
          slot,
        ].join("|");

        if (occupied.has(key)) {
          overlaps += 1;

          console.error(
            `OVERLAP: ${booking._id} conflicts with ${occupied.get(key)} at ${key}`
          );
        } else {
          occupied.set(key, String(booking._id));
        }
      }
    }

    if (invalidRecords === 0) {
      console.log(
        "PASS: Active bookings have valid occupied slots."
      );
    } else {
      console.error(
        `FAIL: ${invalidRecords} active bookings need review.`
      );
      failed = true;
    }

    if (overlaps === 0) {
      console.log(
        "PASS: No overlapping active booking slots found."
      );
    } else {
      console.error(
        `FAIL: ${overlaps} overlapping slots found.`
      );
      failed = true;
    }

    console.log("\nSecurity check summary");

    if (failed) {
      console.error(
        "FAILED: Booking database checks require attention."
      );

      process.exitCode = 1;
    } else {
      console.log(
        "PASSED: Booking index and existing active records are consistent."
      );

      console.log(
        "NOTE: This is not a complete concurrency, authentication or penetration test."
      );
    }
  } catch (error) {
    console.error("Security check failed:", error);
    process.exitCode = 1;
  } finally {
    try {
      await closeDB();
    } catch (error) {
      console.error(
        "Database disconnection failed:",
        error
      );
      process.exitCode = 1;
    }
  }
}

void main();
