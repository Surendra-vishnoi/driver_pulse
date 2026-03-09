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
const hasMongoEnv = Boolean(process.env.MONGO_URI);
const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/driverpulse";
const PYTHON_API_BASE_URL = process.env.PYTHON_API_BASE_URL || "http://127.0.0.1:8000";

const DATA_DIR = path.join(__dirname, "..", "data");
const CLIENT_DIST_DIR = path.join(__dirname, "..", "client", "dist");
const rideEndEvents = [];

function loadCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true });
}

app.use(cors());
app.use(express.json());

async function proxyToPythonApi(req, res) {
  try {
    const upstreamUrl = `${PYTHON_API_BASE_URL}${req.originalUrl}`;
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];

    const options = {
      method: req.method,
      headers,
    };

    if (!["GET", "HEAD"].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      options.body = JSON.stringify(req.body);
      options.headers["content-type"] = "application/json";
    }

    const upstreamResponse = await fetch(upstreamUrl, options);
    const bodyText = await upstreamResponse.text();

    res.status(upstreamResponse.status);
    upstreamResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-length" || key.toLowerCase() === "transfer-encoding") {
        return;
      }
      res.setHeader(key, value);
    });

    return res.send(bodyText);
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: "Python API proxy failed",
      error: error.message,
    });
  }
}

app.post("/api/rides/end-meta", (req, res) => {
  const payload = req.body || {};
  const rideId = String(payload.rideId || "").trim();
  const driverId = String(payload.driverId || "").trim();

  if (!rideId || !driverId) {
    return res.status(400).json({
      success: false,
      message: "rideId and driverId are required.",
    });
  }

  const event = {
    receivedAt: new Date().toISOString(),
    ...payload,
  };

  rideEndEvents.unshift(event);
  if (rideEndEvents.length > 200) {
    rideEndEvents.length = 200;
  }

  console.log(
    `[Ride End Meta] rideId=${rideId} driverId=${driverId} alerts=${Array.isArray(payload.alertMessages) ? payload.alertMessages.length : 0}`
  );

  return res.status(201).json({
    success: true,
    message: "Ride end metadata received.",
    data: event,
  });
});

app.get("/api/rides/end-meta", (req, res) => {
  return res.json({
    success: true,
    count: rideEndEvents.length,
    data: rideEndEvents,
  });
});

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

app.use(["/drivers", "/export", "/docs", "/redoc"], proxyToPythonApi);
app.get("/openapi.json", proxyToPythonApi);

app.use(express.static(CLIENT_DIST_DIR));
app.use((req, res, next) => {
  const pathPrefix = req.path || "";
  if (
    pathPrefix.startsWith("/api") ||
    pathPrefix.startsWith("/drivers") ||
    pathPrefix.startsWith("/export") ||
    pathPrefix.startsWith("/docs") ||
    pathPrefix.startsWith("/redoc") ||
    pathPrefix === "/openapi.json"
  ) {
    return next();
  }
  return res.sendFile(path.join(CLIENT_DIST_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

console.log("Connecting to MongoDB:", hasMongoEnv ? "Using environment variable" : "Using local fallback");
mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
  });