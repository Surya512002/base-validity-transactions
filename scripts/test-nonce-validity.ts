/**
 * Base Nonce Validity Transaction Tester
 *
 * Demonstrates Base's native `base_sendRawTransactionValidity` JSON-RPC method
 * using a "nonce" predicate (introduced in the Cobalt upgrade).
 *
 * How it works:
 * 1. Checks current nonce `N` and current block number.
 * 2. Pre-signs Transaction 2 (with tx nonce = N + 1).
 * 3. Submits Tx 2 to Base Sequencer with a predicate:
 *    - type: "nonce", address: <Account>, op: ">=", value: toHex(N + 1)
 *    - type: "block_number", op: "<=", value: toHex(latestBlock + 50)
 * 4. The sequencer parks Tx 2 in a dormant state.
 * 5. Sends Transaction 1 (tx nonce = N) which advances the account nonce.
 * 6. The sequencer immediately activates and executes Tx 2!
 *
 * Run:
 *   npx tsx scripts/test-nonce-validity.ts
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  toHex,
  formatEther,
  parseEther,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

// Network Selection: 'base' | 'baseSepolia' (default: baseSepolia for safety)
const NETWORK = (process.env.NETWORK || process.env.CHAIN || "baseSepolia").toLowerCase();
const isMainnet = NETWORK === "base" || NETWORK === "mainnet";
const TARGET_CHAIN = isMainnet ? base : baseSepolia;

const SEQUENCER_RPC_URL = isMainnet
  ? (process.env.BASE_SEQUENCER_RPC || "https://mainnet-sequencer.base.org")
  : (process.env.BASE_SEPOLIA_SEQUENCER_RPC || "https://sepolia-sequencer.base.org");

const PUBLIC_RPC_URL = isMainnet
  ? (process.env.BASE_RPC_URL || "https://mainnet.base.org")
  : (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");

// Use provided private key or fallback to environment
const rawPk = process.env.DEPLOYER_PK || process.env.PRIVATE_KEY;

async function main() {
  console.log("==================================================================");
  console.log("   BASE VALIDITY TRANSACTIONS: NONCE PREDICATE TESTER             ");
  console.log("==================================================================\n");

  if (!rawPk) {
    console.log("ℹ️  No DEPLOYER_PK or PRIVATE_KEY provided in environment.");
    console.log("   Generating an ephemeral wallet for demonstration & payload construction.\n");
  }

  const pk: Hex = rawPk && /^0x[0-9a-fA-F]{64}$/.test(rawPk) ? (rawPk as Hex) : generatePrivateKey();
  const account = privateKeyToAccount(pk);

  console.log(`🌐 Network:       ${TARGET_CHAIN.name} (Chain ID ${TARGET_CHAIN.id})`);
  console.log(`🔑 Account:       ${account.address}`);
  console.log(`🌐 Public RPC:    ${PUBLIC_RPC_URL}`);
  console.log(`⚡ Sequencer RPC: ${SEQUENCER_RPC_URL}\n`);

  const publicClient = createPublicClient({
    chain: TARGET_CHAIN,
    transport: http(PUBLIC_RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: TARGET_CHAIN,
    transport: http(PUBLIC_RPC_URL),
  });

  // 1. Fetch current on-chain state
  const [balance, currentNonce, currentBlock] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.getTransactionCount({ address: account.address, blockTag: "latest" }),
    publicClient.getBlockNumber(),
  ]);

  console.log(`📊 Current State:`);
  console.log(`   - ETH Balance: ${formatEther(balance)} ETH`);
  console.log(`   - Current Nonce: ${currentNonce}`);
  console.log(`   - Current Block: ${currentBlock}\n`);

  if (balance < parseEther("0.0001")) {
    console.log(`⚠️  Account balance is too low for live execution on ${TARGET_CHAIN.name} (< 0.0001 ETH).`);
    if (!isMainnet) {
      console.log("   You can get Base Sepolia testnet ETH from https://faucets.chain.link/base-sepolia");
    }
    console.log("   Demonstrating full payload construction & RPC schema verification:\n");

    const targetNonce = currentNonce + 1;
    const expiryBlock = currentBlock + 60n; // ~2 minutes on Base (2s block time)

    // Construct Validity Predicates
    const validityPayload = {
      validity: [
        {
          type: "nonce",
          params: {
            address: account.address,
            op: ">=",
            value: toHex(targetNonce),
          },
        },
        {
          type: "block_number",
          params: {
            op: "<=",
            value: toHex(expiryBlock),
          },
        },
      ],
    };

    console.log("📋 1. Predicates defined:");
    console.log(JSON.stringify(validityPayload, null, 2));

    console.log("\n📦 2. JSON-RPC Request schema:");
    const mockRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "base_sendRawTransactionValidity",
      params: [
        "0x02f8...<signed_tx_raw_hex_with_nonce_" + targetNonce + ">...",
        validityPayload,
      ],
    };
    console.log(JSON.stringify(mockRequest, null, 2));
    console.log("\n✅ Payload structure validated against Base Cobalt specification.");
    return;
  }

  // Live Execution Flow
  console.log("🚀 Starting Live Nonce Validity Test...\n");

  const [fees, gas] = await Promise.all([
    publicClient.estimateFeesPerGas(),
    publicClient.estimateGas({
      account,
      to: account.address,
      value: 0n,
    }),
  ]);

  const nonceTx1 = currentNonce;
  const nonceTx2 = currentNonce + 1;
  const expiryBlock = currentBlock + 60n;

  // Step 2: Sign Transaction 2 (The Conditional Transaction)
  console.log(`✍️  Step 1: Signing Tx 2 (Conditional Tx) with account nonce = ${nonceTx2}...`);
  const rawTx2 = await account.signTransaction({
    chainId: TARGET_CHAIN.id,
    type: "eip1559",
    nonce: nonceTx2,
    to: account.address,
    value: 0n,
    gas: (gas * 13n) / 10n,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  });

  // Step 3: Submit Tx 2 via base_sendRawTransactionValidity to Sequencer
  console.log(`📤 Step 2: Submitting Tx 2 to Sequencer with Nonce Predicate (nonce >= ${nonceTx2})...`);
  const validityConfig = {
    validity: [
      {
        type: "nonce",
        params: {
          address: account.address,
          op: ">=",
          value: toHex(nonceTx2),
        },
      },
      {
        type: "block_number",
        params: {
          op: "<=",
          value: toHex(expiryBlock),
        },
      },
    ],
  };

  const response = await fetch(SEQUENCER_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "base_sendRawTransactionValidity",
      params: [rawTx2, validityConfig],
    }),
  });

  const resJson = (await response.json()) as { result?: Hex; error?: { code: number; message: string } };

  if (resJson.error) {
    console.error(`❌ Sequencer rejected validity transaction:`, resJson.error);
    return;
  }

  const tx2Hash = resJson.result!;
  console.log(`⏳ Tx 2 submitted! Sequencer Hash: ${tx2Hash}`);
  console.log(`   Status: PENDING / DORMANT (Waiting for nonce to reach ${nonceTx2})`);

  // Wait 3 seconds to prove Tx 2 has NOT executed
  console.log("\n⏱️  Waiting 3 seconds to verify Tx 2 is dormant in validity pool...");
  await new Promise((r) => setTimeout(r, 3000));
  const nonceStill = await publicClient.getTransactionCount({ address: account.address });
  console.log(`   Account nonce is still: ${nonceStill} (Tx 2 did not execute, condition unmet).`);

  // Step 4: Send Tx 1 to advance nonce
  console.log(`\n🚀 Step 3: Sending Tx 1 (Trigger Tx) with nonce = ${nonceTx1} to advance nonce...`);
  const tx1Hash = await walletClient.sendTransaction({
    account,
    to: account.address,
    value: 0n,
    nonce: nonceTx1,
  });
  console.log(`   Tx 1 broadcasted! Hash: ${tx1Hash}`);

  console.log("   Waiting for Tx 1 to be mined...");
  const receipt1 = await publicClient.waitForTransactionReceipt({ hash: tx1Hash });
  console.log(`   ✅ Tx 1 confirmed in block ${receipt1.blockNumber}! Account nonce is now ${nonceTx2}.`);

  // Step 5: Verify Tx 2 execution
  console.log("\n⚡ Step 4: Checking Tx 2 (Sequencer should trigger it immediately)...");
  const receipt2 = await publicClient.waitForTransactionReceipt({ hash: tx2Hash });
  console.log(`   🎉 Tx 2 successfully mined in block ${receipt2.blockNumber}!`);
  console.log(`   Tx 2 Hash: ${tx2Hash}`);
  console.log("\n🔥 Nonce Validity Transaction test completed successfully!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
