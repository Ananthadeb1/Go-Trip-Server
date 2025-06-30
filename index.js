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
const hotelCollection = client.db("goTrip").collection("hotels");
const vlog_videosCollection = client.db("goTrip").collection("vlog_videos");
const bookingsCollection = client.db("goTrip").collection("bookings");
const reviewsCollection = client.db("goTrip").collection("reviews");
const expenseCollection = client.db("goTrip").collection("expense");
const itineraryCollection = client.db("goTrip").collection("itinerary");
const busCollection = client.db("goTrip").collection("buses");
const trainCollection = client.db("goTrip").collection("trains");

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
});

//vlog video related apis
app.get("/vlog_videos", async (req, res) => {
  const videos = await vlog_videosCollection.find().toArray(); // Parse JSON data
  res.send(videos);
});

//get all hotels from database
app.get("/hotels", async (req, res) => {
  const hotels = await hotelCollection.find().toArray(); // Parse JSON data
  res.send(hotels);
});

//vahicle related apis
app.get("/buses", async (req, res) => {
  const buses = await busCollection.find().toArray(); // Parse JSON data
  res.send(buses);
});

// Get all trains
app.get("/trains", async (req, res) => {
  const trains = await trainCollection.find().toArray(); // Parse JSON data
  res.send(trains);
});

//bookings related apis
app.post("/bookings", async (req, res) => {
  const booking = req.body;
  console.log(booking);
  const result = await bookingsCollection.insertOne(booking);
  res.send(result);
});
app.get("/bookings", async (req, res) => {
  try {
    const bookings = await bookingsCollection.find().toArray();
    res.send(bookings);
  } catch (error) {
    res
      .status(500)
      .send({ message: "Failed to fetch bookings", error: error.message });
  }
});

// Get a single booking by ID
app.get("/bookings/:_id", async (req, res) => {
  try {
    const userId = req.params._id;

    // Find bookings for this user with status 'confirmed'
    const bookings = await bookingsCollection
      .find({ userId: userId })
      .toArray();

    if (!bookings || bookings.length === 0) {
      return res
        .status(404)
        .send({ message: "No confirmed bookings found for this user" });
    }

    res.send(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

app.patch("/bookings/:id/cancel", async (req, res) => {
  const id = req.params.id;
  const updateData = { status: "cancelled" };
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: updateData };

  const result = await bookingsCollection.updateOne(filter, updateDoc);
  res.send(result);
});

//delete all booking data after deleting the user
app.delete("/bookings/:id", async (req, res) => {
  const bookingId = req.params.id;
  if (!ObjectId.isValid(bookingId)) {
    return res.status(400).send({ message: "Invalid booking ID" });
  }
  try {
    const result = await bookingsCollection.deleteOne({
      _id: new ObjectId(bookingId),
    });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .send({ success: false, message: "Booking not found" });
    }
    res.send({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error("Error deleting booking:", error);
    res
      .status(500)
      .send({ success: false, message: "Failed to delete booking" });
  }
});
//

// Get all bookings for user
// router.get('/', async (req, res) => {
//   try {
//     const bookings = await bookingsCollection
//       .find({ userId: req.user._id })
//       .sort({ bookingTime: -1 })
//       .toArray();
//     res.json(bookings);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// Itinerary related APIs
app.patch("/itineraries/:_id", async (req, res) => {
  const { userId } = req.params;
  const updateData = req.body;

  try {
    const result = await itineraryCollection.updateOne(
      { userId },
      {
        $set: {
          ...updateData,
          updatedAt: new Date(),
          // Set createdAt only if new document is inserted
          ...((await itineraryCollection.countDocuments({ userId })) === 0
            ? { createdAt: new Date() }
            : {}),
        },
      },
      { upsert: true } // Creates if doesn't exist
    );

    const message = result.upsertedId
      ? "New itinerary created"
      : "Existing itinerary updated";

    res.json({ message, result });
  } catch (error) {
    res.status(500).json({ message: "Failed to update itinerary" });
  }
});

app.get("/itineraries/:_id", async (req, res) => {
  const uid = req.params._id;
  try {
    const itinerary = await itineraryCollection.findOne({ userId: uid });
    if (!itinerary) {
      return res.status(404).send({ message: "Itinerary not found" });
    }

    res.send(itinerary);
  } catch (error) {
    console.error("Error fetching itinerary:", error);
    res.status(500).send({ message: "Failed to fetch itinerary" });
  }
});
app.delete("/itineraries/:_id", async (req, res) => {
  const userId = req.params._id;
  try {
    const result = await itineraryCollection.deleteOne({ userId });
    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Itinerary not found" });
    }
    res.send({ success: true, message: "Itinerary deleted" });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Failed to delete itinerary", error: error.message });
  }
});
// Expense related APIs
app.get("/expenses/:_id", async (req, res) => {
  const userId = req.params._id;
  try {
    const expenses = await expenseCollection.find({ userId }).toArray();
    res.send(expenses);
  } catch (error) {
    res
      .status(500)
      .send({ message: "Failed to fetch expenses", error: error.message });
  }
});

// Create a new expense
app.post("/expenses", async (req, res) => {
  const expense = req.body;
  if (
    !expense.userId ||
    !expense.title ||
    !expense.amount ||
    !expense.category ||
    !expense.date
  ) {
    return res.status(400).send({ message: "Missing required fields" });
  }
  try {
    const result = await expenseCollection.insertOne(expense);
    res.send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Failed to add expense", error: error.message });
  }
});

// Update an expense by ID
app.patch("/expenses/:id", async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid expense ID" });
  }
  const updateData = req.body;
  try {
    const result = await expenseCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    res.send({
      success: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Failed to update expense", error: error.message });
  }
});
// Delete a single expense by its ID
app.delete("/expenses/:id", async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid expense ID" });
  }
  try {
    const result = await expenseCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Expense not found" });
    }
    res.send({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Failed to delete expense", error: error.message });
  }
});
app.patch("/reviews/:userId", async (req, res) => {
  const userId = req.params.userId;
  const name = req.params.name;

  if (!userId) {
    return res.status(400).send({ message: "Missing required fields" });
  }

  const updateData = {
    name: req.body.name,
    rating: req.body.rating,
    comment: req.body.comment,
    lastUpdated: new Date(), // Add update timestamp
  };

  try {
    // Find and update the review for this user
    const filter = {
      userId: userId,
    };

    const options = { upsert: true }; // Create if doesn't exist

    const result = await reviewsCollection.updateOne(
      filter,
      { $set: updateData },
      options
    );

    res.send({
      success: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedId: result.upsertedId,
    });
  } catch (error) {
    console.error("Review update error:", error);
    res.status(500).send({
      message: "Failed to update review",
      error: error.message,
    });
  }
});
app.get("/reviews", async (req, res) => {
  try {
    const reviews = await reviewsCollection.find().toArray();
    res.send(reviews);
  } catch (error) {
    res
      .status(500)
      .send({ message: "Failed to fetch reviews", error: error.message });
  }
});

//openrouter API integration
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
