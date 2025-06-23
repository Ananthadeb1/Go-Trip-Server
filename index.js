const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs").promises;
const admin = require("./firebaseAdmin");

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

//DB connection
//don't touch from here to
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.emv2o.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}
run().catch(console.dir);
//here

const userCollection = client.db("goTrip").collection("users");

//jwt releted work
app.post("/jwt", async (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "1h",
  });
  res.send({ token });
});

//midleware for verify jwt token
const verifyToken = (req, res, next) => {
  console.log("inside verify token", req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
  // next();
};
//user releated apis
app.get("/users", verifyToken, async (req, res) => {
  // console.log(req.headers);
  const result = await userCollection.find().toArray();
  res.send(result);
});
//get user by email
app.get("/users/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "unauthorized access" });
  }
  const query = { email: email };
  const user = await userCollection.findOne(query);
  res.send(user);
});

app.post("/users", async (req, res) => {
  const user = req.body;
  console.log(user);
  //check if user already exists
  const query = { email: user.email };
  const existingUser = await userCollection.findOne(query);
  if (existingUser) {
    return res.send({ message: "User already exists", insertedId: null });
  }
  const result = await userCollection.insertOne(user);
  res.send(result);
});

//update user data
app.patch("/users/:id", async (req, res) => {
  const id = req.params.id;

  // Validate ObjectId
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid user ID" });
  }

  const updateData = req.body;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: updateData };

  try {
    const result = await userCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to update user", error });
  }
});

//make normal user to admin
app.patch("/users/admin/:id", async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: {
      role: "admin",
    },
  };
  const result = await userCollection.updateOne(filter, updateDoc);
  res.send(result);
});

//check if user is admin or not
app.get("/users/admin/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "unauthorized access" });
  }
  const query = { email: email };
  const user = await userCollection.findOne(query);
  let admin = false;
  if (user) {
    admin = user?.role === "admin";
  }
  res.send({ admin });
});
app.delete("/users/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  try {
    const query = { _id: new ObjectId(id) };
    const user = await userCollection.findOne(query);
    if (!user) {
      return res
        .status(404)
        .send({ success: false, message: "User not found" });
    }
    // Delete from Firebase Auth using Firebase UID (you must store this at registration)
    if (user.uid) {
      await admin.auth().deleteUser(user.uid);
      console.log(`Successfully deleted user with UID: ${user.uid}`);
    } else {
      console.log("No Firebase UID found for this user.");
    }
    // Delete from MongoDB
    const result = await userCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).send({ success: false, message: "Failed to delete user" });
  }
}); //for clint side work video 68.5 from 6 munite

//get all hotels
// app.get("/hotels", async (req, res) => {
//   const localResponse = { data: "./hotel_Data.json" };
//   const result = await localResponse.find().toArray();
//   res.send(result);
// });

app.get("/hotels", async (req, res) => {
  const data = (await fs.readFile("./hotel_Data.json")).toString();
  const hotels = JSON.parse(data); // Parse JSON data
  res.send(hotels);
});

// DeepSeek API endpoint
app.post("/api/openrouter", async (req, res) => {
  try {
    const { messages } = req.body;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-r1:free",
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://yourdomain.com", // From environment vars
          "X-Title": "Your App Name", // From environment vars
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Check if the key is being loaded correctly

app.get("/", (_, res) => {
  res.send("server setup done");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// for run server type in cmd-
// nodemon index.js
// search in browser
// http://localhost:3000/
//database mail - 103@
