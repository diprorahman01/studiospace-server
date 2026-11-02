
require("dotenv").config();

const dns = require("node:dns");

const {
  connectDB,
  closeDB,
} = require("../src/config/db");

if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const SEED_GROUP = "studiospace-expansion-six-v1";

const ORIGINAL_TITLES = [
  "The Cyclorama Studio",
  "The Podcast Lounge",
  "SoundCraft Recording Suite",
  "Cinema Sound Stage",
  "The Creative Loft",
  "The Artist Workshop",
];

const newStudios = [
  {
    title: "The Fashion Editorial Studio",
    category: "Photo Studio",
    location: "Gulshan, Dhaka",
    hourlyRate: 80,
    securityDeposit: 100,
    maxCapacity: 10,
    image: "/images/studios/fashion-studio.jpg",
    amenities: [
      "Studio Lighting",
      "Photography Backdrops",
      "Changing Area",
      "Styling Mirrors",
      "Clothing Rack",
    ],
    overview:
      "A sample creative photography studio for fashion, portraits, and editorial content. The proposed facilities include studio lighting, backdrops, changing space, and styling equipment.",
  },
  {
    title: "The Green Screen Production Studio",
    category: "Film Stage",
    location: "Tejgaon, Dhaka",
    hourlyRate: 95,
    securityDeposit: 150,
    maxCapacity: 12,
    image: "/images/studios/green-screen-studio.jpg",
    amenities: [
      "Green Screen",
      "Video Lighting",
      "Filming Area",
      "Power Outlets",
    ],
    overview:
      "A sample green-screen production space for promotional videos, visual effects, and digital filmmaking. The proposed setup includes a chroma-key backdrop and controlled lighting.",
  },
  {
    title: "The Product Photography Studio",
    category: "Photo Studio",
    location: "Banani, Dhaka",
    hourlyRate: 70,
    securityDeposit: 100,
    maxCapacity: 6,
    image:
      "/images/studios/Product-Photography-Studio.jpg",
    amenities: [
      "Product Shooting Table",
      "Softbox Lighting",
      "Colored Backdrops",
      "Tripod",
    ],
    overview:
      "A sample commercial photography studio designed for e-commerce products, accessories, cosmetics, and advertising content. The proposed setup includes product tables and professional lighting.",
  },
  {
    title: "The Dance & Performance Studio",
    category: "Creative Workspace",
    location: "Dhanmondi, Dhaka",
    hourlyRate: 75,
    securityDeposit: 100,
    maxCapacity: 18,
    image:
      "/images/studios/dance-performance-studio.jpg",
    amenities: [
      "Rehearsal Floor",
      "Sound System",
      "Performance Lighting",
      "Changing Area",
    ],
    overview:
      "A sample creative space for dance rehearsals, choreography, movement workshops, and performance practice. The proposed facilities include an open floor and sound equipment.",
  },
  {
    title: "The Live Streaming Studio",
    category: "Creative Workspace",
    location: "Uttara, Dhaka",
    hourlyRate: 85,
    securityDeposit: 100,
    maxCapacity: 5,
    image: "/images/studios/streaming-studio.jpg",
    amenities: [
      "Streaming Desk",
      "RGB Lighting",
      "Microphones",
      "Monitor",
      "Camera Setup",
    ],
    overview:
      "A sample creative studio for online streaming, digital presentations, interviews, and video content. The proposed facilities include lighting, microphones, and recording equipment.",
  },
  {
    title: "The Pottery & Ceramic Art Studio",
    category: "Art Workshop",
    location: "Mohammadpur, Dhaka",
    hourlyRate: 65,
    securityDeposit: 80,
    maxCapacity: 10,
    image: "/images/studios/pottery-studio.jpg",
    amenities: [
      "Pottery Workstations",
      "Clay Tools",
      "Work Tables",
      "Art Supplies",
    ],
    overview:
      "A sample creative workshop for pottery, clay modeling, and ceramic art. The proposed setup includes working tables, pottery tools, and space for small creative sessions.",
  },
];

async function seed() {
  const db = await connectDB();
  const collection = db.collection("studios");

  console.log("Connected to:", db.databaseName);

  const originals = await collection
    .find({
      title: { $in: ORIGINAL_TITLES },
    })
    .toArray();

  if (
    originals.length !== 6 ||
    new Set(originals.map((s) => s.title)).size !== 6
  ) {
    throw new Error(
      "Cannot uniquely identify all six original studios."
    );
  }

  const existingNew = await collection.countDocuments({
    seedGroup: SEED_GROUP,
  });

  if (existingNew > 0) {
    console.log(
      "Expansion records already exist. Skipping insertion."
    );
    return;
  }

  const totalBefore = await collection.countDocuments({});

  if (totalBefore !== 6) {
    throw new Error(
      `Expected exactly 6 records, found ${totalBefore}. No changes made.`
    );
  }

  const demoOwner = originals[0];

  if (
    !originals.every(
      (studio) =>
        studio.ownerEmail === demoOwner.ownerEmail &&
        studio.ownerName === demoOwner.ownerName
    )
  ) {
    throw new Error(
      "Original demo studios have different owners. No changes made."
    );
  }

  if (!demoOwner.ownerEmail.endsWith(".example")) {
    throw new Error(
      "This script is restricted to the existing demonstration listings."
    );
  }

  const now = new Date();

  const documents = newStudios.map((studio) => ({
    ...studio,
    images: [studio.image],

    ownerName: demoOwner.ownerName,
    ownerEmail: demoOwner.ownerEmail,

    // Keep these records clearly identified
    // as sample studios.
    isDemo: true,
    seedGroup: SEED_GROUP,
    featured: false,

    rating: 0,
    reviewCount: 0,

    // Not independently verified as bookable.
    status: "draft",

    createdAt: now,
    updatedAt: now,
  }));

  const result = await collection.insertMany(documents);

  await collection.updateMany(
    {
      _id: {
        $in: originals.map((studio) => studio._id),
      },
    },
    {
      $set: {
        featured: true,
      },
    }
  );

  console.log("Inserted:", result.insertedCount);
  console.log(
    "Total studios:",
    await collection.countDocuments({})
  );
  console.log(
    "Featured studios:",
    await collection.countDocuments({
      featured: true,
    })
  );
}

seed()
  .catch((error) => {
    console.error("Seed error:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDB();
  });
