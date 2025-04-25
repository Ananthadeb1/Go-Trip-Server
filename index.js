const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const axios = require("axios");

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

//connection
//don't touch from here to
const { MongoClient, ServerApiVersion } = require("mongodb");
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

//user releated apis
app.get("/users", async (req, res) => {
  const result = await userCollection.find().toArray();
  res.send(result);
});

app.post("/users", async (req, res) => {
  const user = req.body;
  //check if user already exists
  const query = { email: user.email };
  const existingUser = await userCollection.findOne(query);
  if (existingUser) {
    return res.send({ message: "User already exists", insertedId: null });
  }
  const result = await userCollection.insertOne(user);
  res.send(result);
});

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
