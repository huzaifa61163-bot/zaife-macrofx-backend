// GET /api/calendar
// Source: Financial Modeling Prep — economic calendar (previous/forecast/actual).

const CACHE_TTL_MS = 10 * 60 * 1000;
const store = new Map();

const EVENT_KEYWORDS = {
  cpi: ["CPI"],
  pce: ["PCE"],
  nfp: ["Non Farm Payrolls", "Nonfarm Payrolls", "NFP"],
  fomc: ["Fed Interest Rate Decision", "FOMC", "Interest Rate Decision"],
  gdp: ["GDP"],
  ppi: ["PPI", "Producer Price"],
  retail: ["Retail Sales"],
  pmi: ["ISM", "Services PMI"],
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function pad(n) { return n.toString().padStart(2, "0"); }

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ status: "unavailable", reason: "FMP_API_KEY is not set on the server." });
  }

  const cached = store.get("calendar");
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return res.status(200).json(cached.value);
  }

  try {
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 14);
    const to = new Date(today); to.setDate(to.getDate() + 21);
    const fromStr = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
    const toStr = `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`;

    const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${fromStr}&to=${toStr}&apikey=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`FMP request failed: ${r.status}`);
    const data = await r.json();

    if (!Array.isArray(data)) {
      throw new Error("Unexpected response shape from FMP — your plan may not include calendar access.");
    }

    const usEvents = data.filter((e) => e.country === "US");
    const matched = {};
    for (const [id, keywords] of Object.entries(EVENT_KEYWORDS)) {
      const candidates = usEvents
        .filter((e) => keywords.some((k) => (e.event || "").toLowerCase().includes(k.toLowerCase())))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      if (candidates.length === 0) {
        matched[id] = { status: "unavailable", reason: "No matching event found in current calendar window." };
        continue;
      }
      const e = candidates[0];
      matched[id] = {
        status: "live",
        eventName: e.event,
        date: e.date,
        previous: e.previous ?? null,
        forecast: e.estimate ?? null,
        actual: e.actual ?? null,
        released: e.actual !== null && e.actual !== undefined,
        unit: e.unit || null,
      };
    }

    const payload = { status: "live", source: "Financial Modeling Prep", fetchedAt: new Date().toISOString(), events: matched };
    store.set("calendar", { value: payload, at: Date.now() });
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ status: "error", error: err.message, code: "FMP_FETCH_FAILED" });
  }
};
