// GET /api/fx
// Source: Twelve Data — live FX rates for all 7 instruments (one request).

const CACHE_TTL_MS = 45 * 1000;
const store = new Map();

const SYMBOLS = ["USD/JPY", "EUR/USD", "GBP/USD", "XAU/USD", "USD/CHF", "AUD/USD", "USD/CAD"];

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ status: "unavailable", reason: "TWELVEDATA_API_KEY is not set on the server." });
  }

  const cached = store.get("fx");
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return res.status(200).json(cached.value);
  }

  try {
    const symbolParam = encodeURIComponent(SYMBOLS.join(","));
    const url = `https://api.twelvedata.com/quote?symbol=${symbolParam}&apikey=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Twelve Data request failed: ${r.status}`);
    const data = await r.json();

    const bySymbol = SYMBOLS.length === 1 ? { [SYMBOLS[0]]: data } : data;

    const rates = {};
    for (const sym of SYMBOLS) {
      const entry = bySymbol[sym];
      if (!entry || entry.status === "error" || !entry.close) {
        rates[sym] = { status: "error", error: entry?.message || "No data returned" };
        continue;
      }
      rates[sym] = {
        status: "live",
        value: parseFloat(entry.close),
        change: entry.change ? parseFloat(entry.change) : null,
        percentChange: entry.percent_change ? parseFloat(entry.percent_change) : null,
        observedAt: entry.datetime || null,
      };
    }

    const payload = { status: "live", source: "Twelve Data", fetchedAt: new Date().toISOString(), rates };
    store.set("fx", { value: payload, at: Date.now() });
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ status: "error", error: err.message, code: "TWELVEDATA_FETCH_FAILED" });
  }
};
