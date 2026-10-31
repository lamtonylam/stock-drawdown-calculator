/**
 * Human-readable names for well-known symbols. Raw tickers (^GSPC, ^NDX,
 * BTC-USD) mean nothing to most people — use this anywhere a symbol is
 * shown as prose (preset chips, intro copy, errors). The symbol badge next
 * to the chart title intentionally keeps the raw ticker.
 *
 * Unknown symbols fall back to the raw ticker, so this is always safe.
 */
const FRIENDLY_NAMES: Record<string, string> = {
  // Indices
  "^GSPC": "S&P 500",
  "^NDX": "Nasdaq 100",
  "^DJI": "Dow Jones",
  "^RUT": "Russell 2000",
  "^VIX": "VIX",
  "^FTSE": "FTSE 100",
  "^GDAXI": "DAX",
  "^N225": "Nikkei 225",
  "^STOXX50E": "EURO STOXX 50",
  "^HSI": "Hang Seng",
  // Crypto
  "BTC-USD": "Bitcoin",
  "ETH-USD": "Ethereum",
  // OMX Helsinki
  "NOKIA.HE": "Nokia",
  "REMEDY.HE": "Remedy Entertainment",
  "KNEBV.HE": "Kone",
  "FORTUM.HE": "Fortum",
  "NDA-FI.HE": "Nordea",
  "SAMPO.HE": "Sampo",
  "ELISA.HE": "Elisa",
  "NESTE.HE": "Neste",
  "UPM.HE": "UPM",
  "STERV.HE": "Stora Enso",
  "WRT1V.HE": "Wärtsilä",
  "TIETO.HE": "Tietoevry",
  // Mega-caps
  AAPL: "Apple",
  NVDA: "NVIDIA",
  MSFT: "Microsoft",
  GOOGL: "Google",
  GOOG: "Google",
  AMZN: "Amazon",
  META: "Meta",
  TSLA: "Tesla",
  AVGO: "Broadcom",
  // Popular ETFs
  SPY: "S&P 500 ETF",
  QQQ: "Nasdaq 100 ETF",
  DIA: "Dow Jones ETF",
  VTI: "Total US Market ETF",
};

export function friendlyName(symbol: string): string {
  return FRIENDLY_NAMES[symbol.trim().toUpperCase()] ?? symbol;
}

/** Yahoo's venue display names, for codes it leaves cryptic (HEL → HEL). */
const EXCHANGE_NAMES: Record<string, string> = {
  HEL: "Helsinki",
  STO: "Stockholm",
  NYQ: "NYSE",
  NMS: "Nasdaq",
  NGM: "Nasdaq Nordic",
  GER: "Xetra",
  LSE: "London",
  EPA: "Euronext Paris",
  AMS: "Euronext Amsterdam",
  BRU: "Euronext Brussels",
  LIS: "Euronext Lisbon",
  OSL: "Oslo",
  CPH: "Copenhagen",
  ICE: "Iceland",
  FRA: "Frankfurt",
  XETRA: "Xetra",
  TYO: "Tokyo",
  HKG: "Hong Kong",
  SHH: "Shanghai",
  NSE: "India NSE",
  BSE: "India BSE",
  TOR: "Toronto",
  ASX: "Australia",
};

/**
 * Human venue name. Prefers Yahoo's display name unless it just repeats
 * the code, then falls back to a known-codes map, then the raw code.
 */
export function friendlyExchange(code: string, disp?: string): string {
  const c = code.trim().toUpperCase();
  const d = disp?.trim() ?? "";
  if (d && d.toUpperCase() !== c) return d;
  return EXCHANGE_NAMES[c] ?? code;
}
