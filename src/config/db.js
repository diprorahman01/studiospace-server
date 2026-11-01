
const { MongoClient, ServerApiVersion } = require("mongodb");

let client;
let database;

async function connectDB() {
  if (database) {
    return database;
  }

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || "studiospace";

  if (!uri) {
    throw new Error("MONGODB_URI is missing in the .env file");
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });

    database = client.db(dbName);

    console.log("MongoDB connected successfully!");

    return database;
  } catch (error) {
    await client.close();
    client = undefined;
    throw error;
  }
}

function getDB() {
  if (!database) {
    throw new Error("MongoDB is not connected");
  }

  return database;
}

async function closeDB() {
  if (client) {
    await client.close();
    client = undefined;
    database = undefined;
  }
}

module.exports = {
  connectDB,
  getDB,
  closeDB,
};
