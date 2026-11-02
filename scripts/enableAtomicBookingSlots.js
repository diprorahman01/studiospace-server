
require("dotenv").config();

const {
  connectDB,
  closeDB,
} = require("../src/config/db");

const SLOT_MINUTES = 30;
const OPEN_MINUTES = 8 * 60;
const CLOSE_MINUTES = 20 * 60;

function occupiedSlots(start, end) {
  const slots = [];

  for (
    let minute = start;
    minute < end;
    minute += SLOT_MINUTES
  ) {
    slots.push(minute);
  }

  return slots;
}

function validBookingTime(booking) {
  const { startMinutes, endMinutes } = booking;

  return (
    Number.isInteger(startMinutes) &&
    Number.isInteger(endMinutes) &&
    startMinutes >= OPEN_MINUTES &&
    endMinutes <= CLOSE_MINUTES &&
    endMinutes > startMinutes &&
    startMinutes % SLOT_MINUTES === 0 &&
    endMinutes % SLOT_MINUTES === 0
  );
}

async function main() {
  let db;

  try {
    db = await connectDB();

    const bookings = db.collection("bookings");

    console.log(
      "Checking existing active booking records..."
    );

    const activeBookings = await bookings
      .find({
        status: { $in: ["pending", "confirmed"] },
      })
      .toArray();

    console.log(
      `Found ${activeBookings.length} active bookings.`
    );

    const occupiedKeys = new Map();
    const updates = [];
    const conflicts = [];

    for (const booking of activeBookings) {
      if (
        !booking.studioId ||
        typeof booking.date !== "string" ||
        !validBookingTime(booking)
      ) {
        conflicts.push(
          `Booking ${booking._id}: invalid studio, date, or time.`
        );
        continue;
      }

      const slots = occupiedSlots(
        booking.startMinutes,
        booking.endMinutes
      );

      // Detect conflicting historical bookings
      // before making any database changes.
      for (const slot of slots) {
        const key = [
          String(booking.studioId),
          booking.date,
          slot,
        ].join("|");

        const existing = occupiedKeys.get(key);

        if (existing) {
          conflicts.push(
            `Bookings ${existing} and ${booking._id} overlap at ${key}.`
          );
        } else {
          occupiedKeys.set(
            key,
            String(booking._id)
          );
        }
      }

      updates.push({
        updateOne: {
          filter: {
            _id: booking._id,
            status: {
              $in: ["pending", "confirmed"],
            },
          },
          update: {
            $set: {
              occupiedSlots: slots,
            },
          },
        },
      });
    }

    if (conflicts.length > 0) {
      console.error(
        "Cannot enable atomic bookings."
      );
      console.error(
        "Resolve these problems first:"
      );

      for (const conflict of conflicts) {
        console.error(`- ${conflict}`);
      }

      process.exitCode = 1;
      return;
    }

    // Update legacy bookings in batches.
    // Run while booking submissions are paused.
    for (
      let i = 0;
      i < updates.length;
      i += 100
    ) {
      await bookings.bulkWrite(
        updates.slice(i, i + 100),
        { ordered: true }
      );
    }

    console.log(
      "Existing booking slots prepared."
    );

    // This index enforces that active bookings
    // for the same studio and date cannot share
    // any 30-minute occupied slot.
    //
    // Cancelled bookings do not participate.
    // A host rejection also changes the status
    // to cancelled, releasing the slot.
    await bookings.createIndex(
      {
        studioId: 1,
        date: 1,
        occupiedSlots: 1,
      },
      {
        unique: true,
        name: "unique_active_studio_booking_slots",
        partialFilterExpression: {
          status: {
            $in: ["pending", "confirmed"],
          },
          occupiedSlots: {
            $exists: true,
          },
        },
      }
    );

    console.log(
      "Unique booking-slot index enabled successfully."
    );
    console.log(
      "Double-booking protection is ready."
    );
  } catch (error) {
    console.error(
      "Failed to enable atomic booking slots:",
      error
    );

    process.exitCode = 1;
  } finally {
    try {
      await closeDB();
    } catch (error) {
      console.error(
        "Database cleanup failed:",
        error
      );
      process.exitCode = 1;
    }
  }
}

void main();
