
require("dotenv").config();

const { connectDB, closeDB } = require("../src/config/db");

const studios = [
  {
    title: "The Cyclorama Studio",
    category: "Photo Studio",
    location: "Dhanmondi, Dhaka",
    hourlyRate: 60,
    securityDeposit: 100,
    maxCapacity: 10,
    image: "/images/studios/cyclorama-photo.jpg",
    images: ["/images/studios/cyclorama-photo.jpg"],
    amenities: ["Wi-Fi", "AC", "Lighting Kit", "Changing Room"],
    overview:
      "A professional photography studio with a white cyclorama wall, lighting equipment, and a spacious shooting area.",
    rating: 4.9,
    reviewCount: 124,
    ownerName: "StudioSpace Demo Host",
    ownerEmail: "demo-host@studiospace.example",
    createdAt: new Date(),
  },
  {
    title: "The Podcast Lounge",
    category: "Podcast Lounge",
    location: "Gulshan, Dhaka",
    hourlyRate: 40,
    securityDeposit: 50,
    maxCapacity: 6,
    image: "/images/studios/podcast-lounge.jpg",
    images: ["/images/studios/podcast-lounge.jpg"],
    amenities: ["Wi-Fi", "AC", "Microphones", "Sound System"],
    overview:
      "A comfortable podcast recording space for interviews, conversations, and content creation.",
    rating: 4.8,
    reviewCount: 96,
    ownerName: "StudioSpace Demo Host",
    ownerEmail: "demo-host@studiospace.example",
    createdAt: new Date(),
  },
  {
    title: "SoundCraft Recording Suite",
    category: "Music Suite",
    location: "Banani, Dhaka",
    hourlyRate: 50,
    securityDeposit: 80,
    maxCapacity: 8,
    image: "/images/studios/music-recording-suite.jpg",
    images: ["/images/studios/music-recording-suite.jpg"],
    amenities: ["AC", "Recording Equipment", "Sound System", "Wi-Fi"],
    overview:
      "A music production studio equipped with recording equipment and a comfortable creative workspace.",
    rating: 4.9,
    reviewCount: 82,
    ownerName: "StudioSpace Demo Host",
    ownerEmail: "demo-host@studiospace.example",
    createdAt: new Date(),
  },
  {
    title: "Cinema Sound Stage",
    category: "Film Stage",
    location: "Uttara, Dhaka",
    hourlyRate: 120,
    securityDeposit: 200,
    maxCapacity: 25,
    image: "/images/studios/cinema-sound-stage.jpg",
    images: ["/images/studios/cinema-sound-stage.jpg"],
    amenities: ["Lighting Kit", "Changing Room", "AC", "Parking"],
    overview:
      "A spacious production stage suitable for filmmaking, commercial shoots, and video production.",
    rating: 4.7,
    reviewCount: 68,
    ownerName: "StudioSpace Demo Host",
    ownerEmail: "demo-host@studiospace.example",
    createdAt: new Date(),
  },
  {
    title: "The Creative Loft",
    category: "Creative Workspace",
    location: "Mohakhali, Dhaka",
    hourlyRate: 70,
    securityDeposit: 100,
    maxCapacity: 15,
    image: "/images/studios/creative-loft.jpg",
    images: ["/images/studios/creative-loft.jpg"],
    amenities: ["Wi-Fi", "AC", "Natural Light", "Parking"],
    overview:
      "A bright and stylish creative loft for workshops, content creation, and collaborative projects.",
    rating: 4.8,
    reviewCount: 74,
    ownerName: "StudioSpace Demo Host",
    ownerEmail: "demo-host@studiospace.example",
    createdAt: new Date(),
  },
  {
    title: "The Artist Workshop",
    category: "Art Workshop",
    location: "Mirpur, Dhaka",
    hourlyRate: 30,
    securityDeposit: 40,
    maxCapacity: 12,
    image: "/images/studios/art-workshop.jpg",
    images: ["/images/studios/art-workshop.jpg"],
    amenities: ["Wi-Fi", "Natural Light", "Art Supplies", "AC"],
    overview:
      "A welcoming art studio with spacious worktables and natural lighting for painting and creative workshops.",
    rating: 4.9,
    reviewCount: 112,
    ownerName: "StudioSpace Demo Host",
    ownerEmail: "demo-host@studiospace.example",
    createdAt: new Date(),
  },
];

async function seedStudios() {
  try {
    const db = await connectDB();
    const collection = db.collection("studios");

    // Only insert demo studios that do not already exist.
    let inserted = 0;

    for (const studio of studios) {
      const result = await collection.updateOne(
        {
          title: studio.title,
          ownerEmail: studio.ownerEmail,
        },
        { $setOnInsert: studio },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        inserted++;
      }
    }

    console.log(`${inserted} new demo studios added.`);
    console.log("Studio data seeding completed!");
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

seedStudios();
