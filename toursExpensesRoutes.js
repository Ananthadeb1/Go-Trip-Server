const express = require("express");
const { ObjectId } = require("mongodb");

/**
 * TOURS + EXPENSES ROUTES (single source of truth: `tours` collection)
 * ----------------------------------------------------------------------
 * Usage in index.js (after tourCollection/bookingsCollection are created
 * and verifyToken is defined):
 *
 *   const createToursExpensesRoutes = require("./toursExpensesRoutes");
 *   app.use(
 *     createToursExpensesRoutes({
 *       tourCollection,
 *       bookingsCollection,
 *       verifyToken,
 *       getUserIdByEmail,
 *     })
 *   );
 *
 * Then DELETE these from index.js (they're replaced by this file):
 *   - the whole "EXPENSE ROUTES" section
 *   - the whole "TOUR ROUTES" section
 *   - your existing app.post("/bookings", ...) route (replaced below)
 *   - const expenseCollection = client.db("goTrip").collection("expense");
 */
module.exports = function createToursExpensesRoutes({
  tourCollection,
  bookingsCollection,
  verifyToken,
  getUserIdByEmail,
}) {
  const router = express.Router();

  // ==================== TOUR ROUTES ====================

  router.get("/tours/:userId", verifyToken, async (req, res) => {
    const requestedUserId = req.params.userId;
    try {
      const userObjectId = await getUserIdByEmail(req.decoded.email);
      if (!userObjectId)
        return res.status(404).send({ message: "User not found" });
      if (requestedUserId !== userObjectId.toString()) {
        return res.status(403).send({ message: "Unauthorized access" });
      }

      const tours = await tourCollection
        .find({ userId: userObjectId.toString() })
        .sort({ startDate: -1 })
        .toArray();

      res.send(tours);
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to fetch tours", error: error.message });
    }
  });

  router.post("/tours", verifyToken, async (req, res) => {
    const { name, location, startDate, endDate, bookingId, type } = req.body;
    if (!name)
      return res.status(400).send({ message: "Tour name is required" });

    const userObjectId = await getUserIdByEmail(req.decoded.email);
    if (!userObjectId)
      return res.status(404).send({ message: "User not found" });

    try {
      const existing = await tourCollection.findOne({
        userId: userObjectId.toString(),
        name,
        startDate: startDate || null,
      });
      if (existing) {
        return res.status(200).send({
          success: true,
          message: "Tour already exists",
          data: existing,
          duplicate: true,
        });
      }

      const tour = {
        userId: userObjectId.toString(),
        name,
        location: location || "",
        startDate: startDate || null,
        endDate: endDate || null,
        type: type || "custom",
        bookingId: bookingId || null,
        expenses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await tourCollection.insertOne(tour);
      res.status(201).send({
        success: true,
        message: "Tour created successfully",
        data: { ...tour, _id: result.insertedId },
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to create tour", error: error.message });
    }
  });

  router.patch("/tours/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    if (!ObjectId.isValid(id))
      return res.status(400).send({ message: "Invalid tour ID" });

    const { name, location, startDate, endDate } = req.body;

    try {
      const existingTour = await tourCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!existingTour)
        return res.status(404).send({ message: "Tour not found" });

      const userObjectId = await getUserIdByEmail(req.decoded.email);
      if (!userObjectId)
        return res.status(404).send({ message: "User not found" });
      if (existingTour.userId !== userObjectId.toString()) {
        return res
          .status(403)
          .send({ message: "Unauthorized - You can only edit your own tours" });
      }

      const updateData = { updatedAt: new Date() };
      if (name) updateData.name = name;
      if (location !== undefined) updateData.location = location;
      if (startDate !== undefined) updateData.startDate = startDate;
      if (endDate !== undefined) updateData.endDate = endDate;

      const result = await tourCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData },
      );

      res.send({
        success: true,
        message: "Tour updated successfully",
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to update tour", error: error.message });
    }
  });

  router.delete("/tours/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    if (!ObjectId.isValid(id))
      return res.status(400).send({ message: "Invalid tour ID" });

    try {
      const existingTour = await tourCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!existingTour)
        return res.status(404).send({ message: "Tour not found" });

      const userObjectId = await getUserIdByEmail(req.decoded.email);
      if (!userObjectId)
        return res.status(404).send({ message: "User not found" });
      if (existingTour.userId !== userObjectId.toString()) {
        return res
          .status(403)
          .send({
            message: "Unauthorized - You can only delete your own tours",
          });
      }

      const result = await tourCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({
        success: true,
        message: "Tour deleted successfully",
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to delete tour", error: error.message });
    }
  });

  // ==================== EXPENSE ROUTES (embedded in tours) ====================

  router.get("/expenses/:userId", verifyToken, async (req, res) => {
    const requestedUserId = req.params.userId;
    const { tourId } = req.query;

    try {
      const userObjectId = await getUserIdByEmail(req.decoded.email);
      if (!userObjectId)
        return res.status(404).send({ message: "User not found" });
      if (requestedUserId !== userObjectId.toString()) {
        return res.status(403).send({ message: "Unauthorized access" });
      }

      const query = { userId: userObjectId.toString() };
      if (tourId && tourId !== "all") {
        if (!ObjectId.isValid(tourId))
          return res.status(400).send({ message: "Invalid tour ID" });
        query._id = new ObjectId(tourId);
      }

      const tours = await tourCollection.find(query).toArray();
      const expenses = [];
      tours.forEach((tour) => {
        (tour.expenses || []).forEach((exp) => {
          expenses.push({ ...exp, tourId: tour._id.toString() });
        });
      });
      expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

      res.send(expenses);
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to fetch expenses", error: error.message });
    }
  });

  router.post("/expenses", verifyToken, async (req, res) => {
    const { title, amount, category, date, tourId, isAutoAdded } = req.body;

    if (!title || !amount)
      return res.status(400).send({ message: "Title and amount are required" });
    if (!tourId || !ObjectId.isValid(tourId)) {
      return res.status(400).send({ message: "Valid Tour ID is required" });
    }

    const userObjectId = await getUserIdByEmail(req.decoded.email);
    if (!userObjectId)
      return res.status(404).send({ message: "User not found" });

    const expenseId = new ObjectId();
    const expense = {
      _id: expenseId,
      title,
      amount: parseFloat(amount),
      category: category || "Other",
      date: date || new Date().toISOString().split("T")[0],
      isAutoAdded: isAutoAdded || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const result = await tourCollection.updateOne(
        { _id: new ObjectId(tourId), userId: userObjectId.toString() },
        { $push: { expenses: expense } },
      );
      if (result.matchedCount === 0) {
        return res
          .status(404)
          .send({ message: "Tour not found or unauthorized" });
      }

      res.status(201).send({
        success: true,
        message: "Expense created successfully",
        data: { ...expense, tourId, _id: expenseId.toString() },
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to add expense", error: error.message });
    }
  });

  router.patch("/expenses/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    if (!ObjectId.isValid(id))
      return res.status(400).send({ message: "Invalid expense ID" });

    const { title, amount, category, date } = req.body;

    try {
      const userObjectId = await getUserIdByEmail(req.decoded.email);
      if (!userObjectId)
        return res.status(404).send({ message: "User not found" });

      const tour = await tourCollection.findOne({
        userId: userObjectId.toString(),
        "expenses._id": new ObjectId(id),
      });
      if (!tour)
        return res
          .status(404)
          .send({ message: "Expense not found or unauthorized" });

      const updateData = { "expenses.$.updatedAt": new Date() };
      if (title) updateData["expenses.$.title"] = title;
      if (amount !== undefined)
        updateData["expenses.$.amount"] = parseFloat(amount);
      if (category) updateData["expenses.$.category"] = category;
      if (date) updateData["expenses.$.date"] = date;

      const result = await tourCollection.updateOne(
        { userId: userObjectId.toString(), "expenses._id": new ObjectId(id) },
        { $set: updateData },
      );

      res.send({
        success: true,
        message: "Expense updated successfully",
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to update expense", error: error.message });
    }
  });

  router.delete("/expenses/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    if (!ObjectId.isValid(id))
      return res.status(400).send({ message: "Invalid expense ID" });

    try {
      const userObjectId = await getUserIdByEmail(req.decoded.email);
      if (!userObjectId)
        return res.status(404).send({ message: "User not found" });

      const result = await tourCollection.updateOne(
        { userId: userObjectId.toString(), "expenses._id": new ObjectId(id) },
        { $pull: { expenses: { _id: new ObjectId(id) } } },
      );
      if (result.matchedCount === 0) {
        return res
          .status(404)
          .send({ message: "Expense not found or unauthorized" });
      }

      res.send({
        success: true,
        message: "Expense deleted successfully",
        deletedCount: result.modifiedCount,
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to delete expense", error: error.message });
    }
  });

  router.delete("/expenses/bulk-delete", verifyToken, async (req, res) => {
    const { expenseIds } = req.body;
    if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).send({ message: "Expense IDs are required" });
    }

    try {
      const ids = expenseIds
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));
      if (ids.length === 0)
        return res.status(400).send({ message: "Invalid expense IDs" });

      const userObjectId = await getUserIdByEmail(req.decoded.email);
      if (!userObjectId)
        return res.status(404).send({ message: "User not found" });

      const result = await tourCollection.updateMany(
        { userId: userObjectId.toString(), "expenses._id": { $in: ids } },
        { $pull: { expenses: { _id: { $in: ids } } } },
      );

      res.send({
        success: true,
        message: `${result.modifiedCount} expenses deleted successfully`,
        deletedCount: result.modifiedCount,
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to delete expenses", error: error.message });
    }
  });

  // Cancel a booking — removes only the auto-added accommodation expense
  // from its tour (the tour itself, and any other manually-added expenses
  // on it, are left untouched).
  router.patch("/bookings/:id/cancel", async (req, res) => {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid booking ID" });
    }

    try {
      const bookingResult = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "cancelled" } },
      );

      // The tour created for this booking is linked via bookingId (string).
      const pullResult = await tourCollection.updateOne(
        { bookingId: id },
        { $pull: { expenses: { isAutoAdded: true } } },
      );

      res.send({
        ...bookingResult,
        tourFound: pullResult.matchedCount > 0,
        expenseRemoved: pullResult.modifiedCount > 0,
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to cancel booking", error: error.message });
    }
  });

  // ==================== Auto-create tour + expense on hotel booking ====================

  router.post("/bookings", async (req, res) => {
    const booking = req.body;
    try {
      const result = await bookingsCollection.insertOne(booking);

      // Detect a hotel booking even if the caller didn't set type: "hotel"
      // explicitly — fall back to hotel-shaped fields so a tour still gets
      // created. Adjust/extend this check to match whatever fields your
      // hotel booking flow actually sends.
      const isHotelBooking =
        booking.type === "hotel" || !!booking.hotelName || !!booking.hotelId;

      if (!isHotelBooking) {
        return res.send(result);
      }

      if (!booking.userId) {
        console.warn(
          "Hotel booking received without userId — cannot auto-create a tour for it.",
          { bookingId: result.insertedId },
        );
        return res.send(result);
      }

      const existingTour = await tourCollection.findOne({
        userId: booking.userId,
        bookingId: result.insertedId.toString(),
      });

      if (!existingTour) {
        const expenseId = new ObjectId();
        await tourCollection.insertOne({
          userId: booking.userId,
          name: booking.hotelName || "Hotel Booking",
          location: booking.hotelLocation || "",
          startDate: booking.startDate || null,
          endDate: booking.endDate || null,
          type: "hotel",
          bookingId: result.insertedId.toString(),
          expenses: [
            {
              _id: expenseId,
              title: `Hotel Stay: ${booking.hotelName || "Hotel"}`,
              amount: parseFloat(booking.totalCost) || 0,
              category: "Accommodation",
              date: booking.bookingTime
                ? new Date(booking.bookingTime).toISOString().split("T")[0]
                : new Date().toISOString().split("T")[0],
              isAutoAdded: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(
          `✅ Auto-created hotel tour for booking ${result.insertedId}`,
        );
      }

      res.send(result);
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to create booking", error: error.message });
    }
  });

  return router;
};
