// GET /api/health
// Use this first to confirm the deployment works before testing data routes.

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  res.status(200).json({
    status: "ok",
    message: "MacroFX backend is deployed and reachable.",
    checkedAt: new Date().toISOString(),
    keysConfigured: {
      FRED_API_KEY: Boolean(process.env.FRED_API_KEY),
      TWELVEDATA_API_KEY: Boolean(process.env.TWELVEDATA_API_KEY),
      FMP_API_KEY: Boolean(process.env.FMP_API_KEY),
    },
  });
};
