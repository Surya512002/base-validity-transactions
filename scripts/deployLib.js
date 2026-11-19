const { ethers } = require("hardhat");

/** Deploys LimitOrderBook + UniswapV3Adapter and wires one stock market. Returns the contracts. */
async function deployAll(cfg) {
  const [deployer] = await ethers.getSigners();
  const owner = cfg.owner || deployer.address;
  const book = await (await ethers.getContractFactory("LimitOrderBook")).deploy(cfg.quoteToken, owner, cfg.keeperFeeBps ?? 10);
  await book.waitForDeployment();
  const adapter = await (await ethers.getContractFactory("UniswapV3Adapter")).deploy(book.target, cfg.router, owner);
  await adapter.waitForDeployment();
  await (await adapter.setPoolFee(cfg.stockToken, cfg.quoteToken, cfg.poolFee)).wait();
  await (await book.setMarket(cfg.stockToken, cfg.feed, cfg.maxStaleness, adapter.target, cfg.maxStockIn, cfg.maxQuoteIn, cfg.maxDeviationBps ?? 300, true)).wait();
  return { book, adapter };
}
module.exports = { deployAll };
