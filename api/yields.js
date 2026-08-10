// GET /api/yields
// Source: FRED — US 2Y/10Y Treasury yields + 2s10s spread.

const CACHE_TTL_MS = 5 * 60 * 1000;
const store = new Map();

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function fetchSeries(seriesId, apiKey) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=10`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`FRED request failed for ${seriesId}: ${r.status}`);
  const data = await r.json();
  const obs = (data.observations || []).filter((o) => o.value !== ".");
  if (obs.length === 0) throw new Error(`No usable observations for ${seriesId}`);
  return obs;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ status: "unavailable", reason: "FRED_API_KEY is not set on the server." });
  }

  const cached = store.get("yields");
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return res.status(200).json(cached.value);
  }

  try {
    const [twoYear, tenYear] = await Promise.all([
      fetchSeries("DGS2", apiKey),
      fetchSeries("DGS10", apiKey),
    ]);

    const latest2y = parseFloat(twoYear[0].value);
    const prev2y = parseFloat(twoYear[1]?.value ?? twoYear[0].value);
    const latest10y = parseFloat(tenYear[0].value);
    const prev10y = parseFloat(tenYear[1]?.value ?? tenYear[0].value);

    const payload = {
      status: "live",
      source: "FRED (Federal Reserve Bank of St. Louis)",
      fetchedAt: new Date().toISOString(),
      us2y: {
        value: latest2y,
        change: +(latest2y - prev2y).toFixed(3),
        observedAt: twoYear[0].date,
        seriesId: "DGS2",
        history: twoYear.slice(0, 7).reverse().map((o) => parseFloat(o.value)),
      },
      us10y: {
        value: latest10y,
        change: +(latest10y - prev10y).toFixed(3),
        observedAt: tenYear[0].date,
        seriesId: "DGS10",
        history: tenYear.slice(0, 7).reverse().map((o) => parseFloat(o.value)),
      },
      spread2s10s: +(latest10y - latest2y).toFixed(3),
    };

    store.set("yields", { value: payload, at: Date.now() });
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ status: "error", error: err.message, code: "FRED_FETCH_FAILED" });
  }
};
