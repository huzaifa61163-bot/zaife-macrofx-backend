// GET /api/economic-data?indicator=cpi_yoy
// Source: FRED — official actuals only (no forecasts; those come from /api/calendar).

const { setCors, cacheGet, cacheSet, errorResponse, unavailableResponse } = require("../lib/util");

const CACHE_TTL_MS = 15 * 60 * 1000;

const INDICATORS = {
  cpi_yoy: { series: "CPIAUCSL", label: "US CPI (YoY)", transform: "yoy_pct", unit: "%" },
  core_cpi_yoy: { series: "CPILFESL", label: "US Core CPI (YoY)", transform: "yoy_pct", unit: "%" },
  pce_yoy: { series: "PCEPI", label: "US PCE (YoY)", transform: "yoy_pct", unit: "%" },
  core_pce_yoy: { series: "PCEPILFE", label: "US Core PCE (YoY)", transform: "yoy_pct", unit: "%" },
  gdp_growth: { series: "A191RL1Q225SBEA", label: "US GDP (QoQ Annualized)", transform: "level", unit: "%" },
  ppi_yoy: { series: "PPIACO", label: "US PPI (YoY)", transform: "yoy_pct", unit: "%" },
  retail_sales_mom: { series: "RSAFS", label: "US Retail Sales (MoM)", transform: "mom_pct", unit: "%" },
  unemployment_rate: { series: "UNRATE", label: "US Unemployment Rate", transform: "level", unit: "%" },
  nfp_change: { series: "PAYEMS", label: "US Non-Farm Payrolls (Monthly Change)", transform: "mom_diff_thousands", unit: "K" },
  fed_funds_rate: { series: "DFF", label: "Effective Federal Funds Rate", transform: "level", unit: "%" },
  ecb_rate: { series: "ECBDFR", label: "ECB Deposit Facility Rate", transform: "level", unit: "%" },
  boe_rate: { series: "IUDSOIA", label: "SONIA (BoE Bank Rate Proxy)", transform: "level", unit: "%" },
};

async function fetchObservations(seriesId, apiKey, limit) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`FRED request failed for ${seriesId}: ${r.status}`);
  const data = await r.json();
  const obs = (data.observations || []).filter((o) => o.value !== ".");
  if (obs.length === 0) throw new Error(`No usable observations for ${seriesId}`);
  return obs;
}

function computeValue(obs, transform) {
  const latest = parseFloat(obs[0].value);
  switch (transform) {
    case "level":
      return { value: +latest.toFixed(2), observedAt: obs[0].date };
    case "mom_pct": {
      const prev = parseFloat(obs[1].value);
      return { value: +(((latest - prev) / prev) * 100).toFixed(2), observedAt: obs[0].date };
    }
    case "mom_diff_thousands": {
      const prev = parseFloat(obs[1].value);
      return { value: Math.round(latest - prev), observedAt: obs[0].date };
    }
    case "yoy_pct": {
      const yearAgo = obs[12] ? parseFloat(obs[12].value) : null;
      if (yearAgo === null) return { value: null, observedAt: obs[0].date };
      return { value: +(((latest - yearAgo) / yearAgo) * 100).toFixed(2), observedAt: obs[0].date };
    }
    default:
      return { value: latest, observedAt: obs[0].date };
  }
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(200).json(unavailableResponse("FRED_API_KEY is not set on the server."));

  const indicator = req.query.indicator;
  const config = INDICATORS[indicator];
  if (!config) {
    return res.status(400).json(errorResponse(`Unknown indicator "${indicator}". Valid options: ${Object.keys(INDICATORS).join(", ")}`, "BAD_INDICATOR"));
  }

  const cacheKey = `econ:${indicator}`;
  const cached = cacheGet(cacheKey, CACHE_TTL_MS);
  if (cached) return res.status(200).json(cached);

  try {
    const limit = config.transform === "yoy_pct" ? 14 : 3;
    const obs = await fetchObservations(config.series, apiKey, limit);
    const { value, observedAt } = computeValue(obs, config.transform);

    if (value === null) {
      return res.status(200).json({ ...unavailableResponse("Not enough history returned by FRED to compute this figure yet."), label: config.label });
    }

    const payload = {
      status: "live",
      label: config.label,
      value,
      unit: config.unit,
      source: "FRED (Federal Reserve Bank of St. Louis)",
      seriesId: config.series,
      observedAt,
      fetchedAt: new Date().toISOString(),
    };
    cacheSet(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json(errorResponse(err.message, "FRED_FETCH_FAILED"));
  }
};
