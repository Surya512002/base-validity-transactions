// Usage: npx hardhat run scripts/deploy.js --network baseSepolia   (see .env.example for variables)
const { ethers } = require("hardhat");
const { deployAll } = require("./deployLib");

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function main() {
  const cfg = {
    quoteToken: ethers.getAddress(req("QUOTE_TOKEN")), // USDC
    router: ethers.getAddress(req("SWAP_ROUTER")), // Uniswap V3 SwapRouter02 on the target chain
    stockToken: ethers.getAddress(req("STOCK_TOKEN")),
    feed: ethers.getAddress(req("PRICE_FEED")), // Chainlink USD feed for that stock
    poolFee: Number(req("POOL_FEE")), // e.g. 500, 3000, 10000
    maxStaleness: Number(process.env.MAX_STALENESS_SECONDS || 3600),
    maxStockIn: ethers.parseUnits(process.env.MAX_STOCK_IN || "10", Number(process.env.STOCK_DECIMALS || 18)),
    maxQuoteIn: ethers.parseUnits(process.env.MAX_QUOTE_IN || "500", Number(process.env.QUOTE_DECIMALS || 6)),
    keeperFeeBps: Number(process.env.KEEPER_FEE_BPS || 10),
    maxDeviationBps: Number(process.env.MAX_DEVIATION_BPS || 300), // fill must be within this % of the oracle price
    owner: process.env.OWNER_ADDRESS, // use a multisig for anything holding real value
  };
  const { book, adapter } = await deployAll(cfg);
  console.log("LimitOrderBook:", book.target);
  console.log("UniswapV3Adapter:", adapter.target);
}
main().catch((e) => { console.error(e); process.exit(1); });
