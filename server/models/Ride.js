const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    value: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const rideSummarySchema = new mongoose.Schema(
  {
    rideId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    driverId: {
      type: String,
      required: true,
      trim: true,
    },
    targetPay: {
      type: Number,
      required: true,
      min: 0,
    },
    summaryStats: {
      avgStress: {
        type: Number,
        required: true,
      },
      totalEvents: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    incidents: {
      type: [incidentSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "ride_summaries",
  }
);

module.exports = mongoose.model("RideSummary", rideSummarySchema);