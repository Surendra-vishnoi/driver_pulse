export const earningsFallback = {
  // Use conservative multipliers so early-shift forecast does not jump unrealistically.
  historyMultipliers: [0.7, 0.78, 0.85, 0.91, 0.96, 1.0],
  forecastMultipliers: [1.12, 1.24, 1.36, 1.5, 1.65],
  minForecastGain: 220,
  maxForecastToCurrentRatio: 3.0,
  maxForecastToTargetRatio: 1.6,
}
