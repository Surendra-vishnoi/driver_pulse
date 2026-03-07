const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const RideSummary = require("./models/Ride");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/driver_pulse";

const DATA_DIR = path.join(__dirname, "..", "data");

function loadCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true });
}

app.use(cors());
app.use(express.json());

app.post("/api/rides/complete", async (req, res) => {
  try {
    const rideSummary = await RideSummary.create(req.body);

    if ((rideSummary.incidents || []).length > 3) {
      console.log(
        `[High-Risk Session] rideId=${rideSummary.rideId} driverId=${rideSummary.driverId} incidents=${rideSummary.incidents.length}`
      );
    }

    return res.status(201).json({
      success: true,
      message: "Ride summary saved successfully.",
      data: rideSummary,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A ride summary with this rideId already exists.",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Failed to save ride summary.",
      error: error.message,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "driver-pulse-server" });
});

app.get("/api/sensor-data", (req, res) => {
  try {
    const accel = loadCsv(path.join(DATA_DIR, "sensor_data", "accelerometer_data.csv"));
    const audio = loadCsv(path.join(DATA_DIR, "sensor_data", "audio_intensity_data.csv"));
    const trips = loadCsv(path.join(DATA_DIR, "trips", "trips.csv"));
    res.json({ success: true, data: { accel, audio, trips } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load sensor data.", error: error.message });
  }
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected.");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  });