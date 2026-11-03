const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");
const router = express.Router();
const validId = (value) => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const record = await getDB().collection("userFavorites").findOne({ userId: req.user.id });
    return res.json({ success: true, data: Array.isArray(record?.studioIds) ? record.studioIds : [] });
  } catch (error) {
    console.error("Favorites read error:", error);
    return res.status(500).json({ success: false, message: "Unable to load saved studios." });
  }
});

router.put("/", async (req, res) => {
  try {
    if (req.headers.origin !== (process.env.CLIENT_URL || "http://localhost:3000")) {
      return res.status(403).json({ success: false, message: "Invalid request origin." });
    }
    const ids = req.body?.studioIds;
    if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => !validId(id))) {
      return res.status(400).json({ success: false, message: "Please submit up to 200 valid studio IDs." });
    }
    const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
    const present = await getDB().collection("studios")
      .find({ _id: { $in: unique.map((id) => new ObjectId(id)) } }, { projection: { _id: 1 } })
      .toArray();
    const validSet = new Set(present.map((item) => String(item._id)));
    const saved = unique.filter((id) => validSet.has(id));
    await getDB().collection("userFavorites").updateOne(
      { userId: req.user.id },
      { $set: { studioIds: saved, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    return res.json({ success: true, data: saved });
  } catch (error) {
    console.error("Favorites update error:", error);
    return res.status(500).json({ success: false, message: "Unable to save your studios." });
  }
});

module.exports = router;
