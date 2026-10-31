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
