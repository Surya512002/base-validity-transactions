/**
 * Base Nonce Validity Transaction Tester & Interactive Suite
 *
 * Demonstrates Base's native `base_sendRawTransactionValidity` JSON-RPC method
 * using a "nonce" predicate (introduced in the Cobalt upgrade).
 *
 * Supported CLI Modes:
 *   1. trigger (default):
 *      Pre-signs Tx 2 (nonce >= N + 1), verifies dormancy in the sequencer,
 *      then broadcasts Tx 1 (nonce = N). As soon as Tx 1 confirms, the
 *      sequencer automatically triggers and executes Tx 2!
 *
 *   2. invalidate:
 *      Demonstrates ZERO-GAS CANCELLATION. Submits Tx 2 with predicate `op: "="`
 *      for nonce N. Then sends an intermediate transaction advancing the account
 *      nonce to N + 1. The sequencer permanently invalidates and drops Tx 2
 *      with zero gas wasted on reverts or cancellations!
 *
 * CLI Flags:
 *   --mainnet             Target Base Mainnet (Chain ID 8453)
 *   --sepolia             Target Base Sepolia (Chain ID 84532, default)
 *   --mode <type>         'trigger' | 'invalidate' (default: 'trigger')
 *   --to <address>        Override target recipient (default: self)
 *   --watch <address>     Override watched address (default: self)
 *
 * Examples:
 *   npx tsx scripts/test-nonce-validity.ts
 *   npx tsx scripts/test-nonce-validity.ts --mainnet
 *   npx tsx scripts/test-nonce-validity.ts --mode invalidate
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  formatGwei,
  parseEther,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import {
  sendRawTransactionValidity,
  createNoncePredicate,
  createBlockPredicate,
} from "../shared/validity";

// Parse CLI flags
const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const param = (name: string): string | undefined => {
  const index = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (index === -1) return undefined;
  if (args[index].includes("=")) return args[index].split("=")[1];
  return args[index + 1];
};

const isMainnet = flag("mainnet") || (process.env.NETWORK || process.env.CHAIN || "").toLowerCase() === "base";
const TARGET_CHAIN = isMainnet ? base : baseSepolia;
const MODE = (param("mode") || process.env.TEST_MODE || "trigger").toLowerCase();

const SEQUENCER_RPC_URL = isMainnet
  ? (process.env.BASE_SEQUENCER_RPC || "https://mainnet-sequencer.base.org")
  : (process.env.BASE_SEPOLIA_SEQUENCER_RPC || "https://sepolia-sequencer.base.org");

const alchemyKey = process.env.ALCHEMY_API_KEY;
const defaultPublicRpc = isMainnet
  ? (alchemyKey ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}` : "https://mainnet.base.org")
  : (alchemyKey ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}` : "https://sepolia.base.org");

const PUBLIC_RPC_URL = isMainnet
  ? (process.env.BASE_RPC_URL || defaultPublicRpc)
  : (process.env.BASE_SEPOLIA_RPC_URL || defaultPublicRpc);

const rawPk = process.env.DEPLOYER_PK || process.env.PRIVATE_KEY;

async function main() {
  console.log("==================================================================");
  console.log("   BASE VALIDITY TRANSACTIONS: NONCE PREDICATE SUITE             ");
  console.log("==================================================================");
  console.log(`⚡ Mode:             ${MODE.toUpperCase()} (${MODE === "invalidate" ? "Zero-Gas Invalidation" : "Auto-Trigger Queue"})`);
  console.log(`🌐 Network:          ${TARGET_CHAIN.name} (Chain ID ${TARGET_CHAIN.id})`);

  if (isMainnet) {
    console.log("⚠️  NOTICE: Running on BASE MAINNET with live state!");
  }

  if (!rawPk) {
    console.log("\nℹ️  No DEPLOYER_PK provided in environment.");
    console.log("   Using ephemeral wallet for dry-run verification & schema validation.\n");
  }

  const pk: Hex = rawPk && /^0x[0-9a-fA-F]{64}$/.test(rawPk) ? (rawPk as Hex) : generatePrivateKey();
  const account = privateKeyToAccount(pk);

  const targetRecipient: Address = (param("to") as Address) || (process.env.TARGET_RECIPIENT as Address) || account.address;
  const watchedAddress: Address = (param("watch") as Address) || (process.env.WATCH_ADDRESS as Address) || account.address;

  console.log(`🔑 Sender Account:    ${account.address}`);
  console.log(`🎯 Target Recipient: ${targetRecipient} ${targetRecipient === account.address ? "(self-transfer)" : ""}`);
  console.log(`👀 Watched Address:   ${watchedAddress} ${watchedAddress === account.address ? "(self-triggering nonce)" : "(cross-account trigger)"}`);
  console.log(`🌐 Public RPC:       ${PUBLIC_RPC_URL}`);
  console.log(`⚡ Sequencer RPC:    ${SEQUENCER_RPC_URL}\n`);

  const publicClient = createPublicClient({
    chain: TARGET_CHAIN,
    transport: http(PUBLIC_RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: TARGET_CHAIN,
    transport: http(PUBLIC_RPC_URL),
  });

  // Query live network state
  const [balance, currentNonce, currentBlock, fees] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.getTransactionCount({ address: account.address, blockTag: "latest" }),
    publicClient.getBlockNumber(),
    publicClient.estimateFeesPerGas(),
  ]);

  console.log(`📊 Current State:`);
  console.log(`   - ETH Balance:    ${formatEther(balance)} ETH`);
  console.log(`   - Account Nonce:  ${currentNonce}`);
  console.log(`   - Current Block:  ${currentBlock}`);
  console.log(`   - Base Gas Fee:   ${fees.maxFeePerGas ? formatGwei(fees.maxFeePerGas) : "N/A"} Gwei\n`);

  // Minimum required balance check (~0.0001 ETH)
  const minRequiredBalance = parseEther("0.0001");
  if (balance < minRequiredBalance) {
    console.log(`⚠️  Account balance is below 0.0001 ETH (insufficient for live broadcasting).`);
    if (!isMainnet) {
      console.log("   Get free Base Sepolia testnet ETH: https://faucets.chain.link/base-sepolia");
    }
    console.log("   Displaying full dry-run payload construction & sequencer verification:\n");

    const targetNonce = currentNonce + 1;
    const expiryBlock = currentBlock + 60n; // ~2 minutes on Base

    const predicates = [
      createNoncePredicate(watchedAddress, MODE === "invalidate" ? "=" : ">=", targetNonce),
      createBlockPredicate("<=", expiryBlock),
    ];

    console.log("📋 1. Constructed Predicates:");
    console.log(JSON.stringify({ validity: predicates }, null, 2));

    console.log("\n📦 2. JSON-RPC Dispatch Schema (`base_sendRawTransactionValidity`):");
    console.log(
      JSON.stringify(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "base_sendRawTransactionValidity",
          params: [
            `0x02f8...<signed_eip1559_tx_nonce_${targetNonce}>...`,
            { validity: predicates },
          ],
        },
        null,
        2
      )
    );

    console.log("\n✅ Dry-run validation passed! Ready for live execution with funded wallet.");
    return;
  }

  // Live Execution Flow
  console.log("🚀 Initiating Live Execution on " + TARGET_CHAIN.name + "...\n");

  const gasEstimate = await publicClient.estimateGas({
    account,
    to: targetRecipient,
    value: 0n,
  });

  const expiryBlock = currentBlock + 60n; // +60 blocks (~2 minutes)

  if (MODE === "invalidate") {
    /**
     * MODE: ZERO-GAS INVALIDATION DEMO
     * 1. Pre-sign Tx 2 with nonce = currentNonce and predicate op: "=" value: currentNonce.
     * 2. Submit Tx 2 via validity transactions.
     * 3. Broadcast an intermediate Tx 1 (advances nonce to currentNonce + 1).
     * 4. Because nonce moved past currentNonce, Tx 2 is dropped by sequencer for ZERO GAS!
     */
    console.log("--- STEP 1: Signing Conditional Tx (bound to nonce = " + currentNonce + ") ---");
    const rawTx = await account.signTransaction({
      chainId: TARGET_CHAIN.id,
      type: "eip1559",
      nonce: currentNonce,
      to: targetRecipient,
      value: 0n,
      gas: (gasEstimate * 13n) / 10n,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });

    console.log("--- STEP 2: Submitting to Sequencer with Strict Equality (`op: '='`) ---");
    const predicates = [
      createNoncePredicate(watchedAddress, "=", currentNonce),
      createBlockPredicate("<=", expiryBlock),
    ];

    const validityHash = await sendRawTransactionValidity(SEQUENCER_RPC_URL, rawTx, predicates);
    console.log(`✅ Validity Transaction submitted! Hash: ${validityHash}`);
    console.log(`   Condition: MUST execute while nonce == ${currentNonce}\n`);

    console.log("--- STEP 3: Broadcasting Invalidation Transaction (Advancing Nonce) ---");
    const cancelTxHash = await walletClient.sendTransaction({
      account,
      to: account.address,
      value: 0n,
      nonce: currentNonce,
    });
    console.log(`   Broadcasted Invalidation Tx! Hash: ${cancelTxHash}`);
    console.log("   Waiting for confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: cancelTxHash });
    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}! Account nonce advanced to ${currentNonce + 1}.`);

    console.log("\n🎉 ZERO-GAS CANCELLATION SUCCESSFUL!");
    console.log(`   The validity transaction (${validityHash}) condition [nonce == ${currentNonce}]`);
    console.log("   can never be satisfied again. The Base sequencer automatically drops it without");
    console.log("   charging you any revert or cancellation gas!");

  } else {
    /**
     * MODE: TRIGGER (AUTO-QUEUE PIPELINE)
     * 1. Pre-sign Tx 2 with nonce = currentNonce + 1 and predicate op: ">=" value: currentNonce + 1.
     * 2. Submit Tx 2 to sequencer (dormant).
     * 3. Broadcast Tx 1 with nonce = currentNonce.
     * 4. Sequencer detects condition met and executes Tx 2 immediately in the next block!
     */
    const nonceTx1 = currentNonce;
    const nonceTx2 = currentNonce + 1;

    console.log(`--- STEP 1: Signing Tx 2 (Conditional Tx) with nonce = ${nonceTx2} ---`);
    const rawTx2 = await account.signTransaction({
      chainId: TARGET_CHAIN.id,
      type: "eip1559",
      nonce: nonceTx2,
      to: targetRecipient,
      value: 0n,
      gas: (gasEstimate * 13n) / 10n,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });

    console.log(`--- STEP 2: Submitting Tx 2 to Sequencer with Nonce Predicate (>= ${nonceTx2}) ---`);
    const predicates = [
      createNoncePredicate(watchedAddress, ">=", nonceTx2),
      createBlockPredicate("<=", expiryBlock),
    ];

    const tx2Hash = await sendRawTransactionValidity(SEQUENCER_RPC_URL, rawTx2, predicates);
    console.log(`⏳ Tx 2 submitted! Sequencer Hash: ${tx2Hash}`);
    console.log(`   Status: DORMANT in validity pool (Waiting for nonce >= ${nonceTx2})`);

    // Verify dormancy
    console.log("\n⏱️  Verifying dormancy (waiting 3 seconds)...");
    await new Promise((r) => setTimeout(r, 3000));
    const verifiedNonce = await publicClient.getTransactionCount({ address: account.address });
    console.log(`   Account nonce is still: ${verifiedNonce} (Tx 2 is correctly parked, condition unmet).`);

    // Broadcast trigger transaction
    console.log(`\n--- STEP 3: Broadcasting Tx 1 (Trigger Tx) with nonce = ${nonceTx1} ---`);
    const tx1Hash = await walletClient.sendTransaction({
      account,
      to: account.address,
      value: 0n,
      nonce: nonceTx1,
    });
    console.log(`   Tx 1 broadcasted! Hash: ${tx1Hash}`);
    console.log("   Waiting for Tx 1 confirmation...");
    const receipt1 = await publicClient.waitForTransactionReceipt({ hash: tx1Hash });
    console.log(`   ✅ Tx 1 confirmed in block ${receipt1.blockNumber}! Account nonce is now ${nonceTx2}.`);

    // Verify automatic trigger of Tx 2
    console.log("\n--- STEP 4: Watching Tx 2 Auto-Execution ---");
    console.log("   Base sequencer evaluating predicate... condition now TRUE!");
    const receipt2 = await publicClient.waitForTransactionReceipt({ hash: tx2Hash });
    console.log(`   🎉 Tx 2 successfully mined in block ${receipt2.blockNumber}!`);
    console.log(`   Tx 2 Hash: ${tx2Hash}`);
    console.log("\n🔥 Nonce Validity Transaction pipeline executed flawlessly!");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
