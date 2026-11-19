# Base Limit Orders & Validity Transactions

[![Tests & Verification](https://github.com/Surya512002/base-validity-transactions/actions/workflows/test.yml/badge.svg)](https://github.com/Surya512002/base-validity-transactions/actions/workflows/test.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Base Mainnet](https://img.shields.io/badge/Network-Base%20Mainnet%20%26%20Sepolia-0052FF.svg)](https://base.org)

A production-grade implementation of on-chain limit orders, automated DCA, and **Base Validity Transactions** (featuring native `nonce`, `block_number`, `balance`, and `storage` predicates via Base's sequencer JSON-RPC `base_sendRawTransactionValidity`).

---

## ⚡ Key Highlights & Features

1. **Native Base Validity Transactions SDK (`shared/validity.ts`)**:
   - Strongly-typed builders for `nonce`, `block_number`, `balance`, and `storage` predicates.
   - Direct JSON-RPC dispatcher for Base Sequencer endpoints (`https://mainnet-sequencer.base.org` and `https://sepolia-sequencer.base.org`).
2. **Interactive Nonce Validity CLI Suite (`scripts/test-nonce-validity.ts`)**:
   - **Auto-Trigger Queue Mode (`--mode trigger`)**: Pre-signs transactions that sleep dormant in the sequencer mempool until an account's nonce advances, firing automatically in the next block/Flashblock.
   - **Zero-Gas Invalidation Mode (`--mode invalidate`)**: Demonstrates native transaction cancellation without paying gas to revert or replace.
   - Multi-network support: seamlessly run on **Base Mainnet** (`--mainnet`) or **Base Sepolia** (`--sepolia`).
3. **Escrow & Order Book Smart Contracts (`contracts/`)**:
   - `LimitOrderBook.sol`: Escrow contract supporting Limit Buy, Take-Profit, Stop-Loss, Trailing Stops, Bracket (OCO) orders, and Recurring Buys (DCA).
   - `UniswapV3Adapter.sol`: Swap adapter executing fills directly through Uniswap V3.
   - Built-in oracle-bounded fill guard (Chainlink) and stale-price protection.
4. **Autonomous Keeper Bot (`keeper/`)**:
   - Ratchets trailing stops, fills triggered orders, refunds expired orders, and runs scheduled DCAs.
   - Supports native Base Validity Transaction mode (`VALIDITY_TX=1`) to prevent stale/delayed transaction inclusions.

---

## 🚀 Quickstart

### 1. Clone the repository
```bash
git clone https://github.com/Surya512002/base-validity-transactions.git
cd base-validity-transactions
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment Variables
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Configure your `.env` variables:
* `DEPLOYER_PK`: Your 0x-prefixed private key (needs a small amount of Base ETH or Base Sepolia ETH for live tests).
* `BASE_RPC_URL`: `https://mainnet.base.org`
* `BASE_SEQUENCER_RPC`: `https://mainnet-sequencer.base.org`
* `BASE_SEPOLIA_RPC_URL`: `https://sepolia.base.org`
* `BASE_SEPOLIA_SEQUENCER_RPC`: `https://sepolia-sequencer.base.org`

---

## 🧪 Testing & Interactive CLI

### 1. Nonce Validity Transactions CLI

The interactive testing suite runs out of the box with dry-run schema validation or full on-chain execution:

```bash
# Default: Auto-Trigger Queue on Base Sepolia
npm run test:validity

# Run on Base Mainnet
npm run test:validity -- --mainnet

# Demonstrate Zero-Gas Invalidation (Cancellation)
npm run test:validity -- --mode invalidate

# Target a custom recipient or watch another account's nonce
npm run test:validity -- --to 0xRecipientAddress... --watch 0xWatchedAddress...
```

#### Supported CLI Flags:
| Flag | Description | Default |
| :--- | :--- | :--- |
| `--mainnet` | Target Base Mainnet (Chain ID 8453) | Base Sepolia |
| `--sepolia` | Target Base Sepolia (Chain ID 84532) | Default |
| `--mode <trigger\|invalidate>` | `trigger` (auto-execute on nonce threshold) or `invalidate` (zero-gas cancellation demo) | `trigger` |
| `--to <address>` | Destination address for conditional transaction | Sender account |
| `--watch <address>` | Account whose nonce the sequencer monitors | Sender account |

---

### 2. Run Smart Contract Test Suite
Runs all 47 Hardhat unit & integration tests:
```bash
npm test
```

### 3. Test Math & Validation Helpers
```bash
npm run test:math
```

### 4. Typecheck Codebase
```bash
npm run typecheck
```

---

## 🛠️ Complete Guide: Customizing Addresses & Validity Conditions

In Base Validity Transactions, there are two distinct addresses you can configure:

| Address Parameter | Environment Variable / Flag | What it does | Default if omitted |
| :--- | :--- | :--- | :--- |
| **Target Recipient** (`to`) | `TARGET_RECIPIENT` / `--to` | The destination address that receives the transaction (wallet transfer or contract call). | Sender wallet (safe self-transfer) |
| **Watched Address** (`params.address`) | `WATCH_ADDRESS` / `--watch` | The account whose on-chain protocol nonce the Base sequencer monitors. | Sender wallet (self-trigger) |

---

### Configuration Scenarios

#### Scenario A: Safe Self-Test (Default)
Executes a 0 ETH self-transfer to prove sequencer dormancy and instant block inclusion with zero financial risk:
```env
# .env
DEPLOYER_PK=0xYourPrivateKey...
# Leave TARGET_RECIPIENT and WATCH_ADDRESS unset
```

#### Scenario B: Send Funds / Call Contract on Nonce Trigger
Executes a transaction to a specific destination wallet or contract once your own account reaches a target nonce:
```env
# .env
DEPLOYER_PK=0xYourPrivateKey...
TARGET_RECIPIENT=0xRecipientWalletOrContractAddress...
```

#### Scenario C: Cross-Account Trigger (The Superpower)
Your account pre-signs a transaction (Tx 2) that will **only** execute after a completely different account (e.g. a counterparty, bot, or multisig) completes an on-chain transaction:
```env
# .env
DEPLOYER_PK=0xYourPrivateKey...
TARGET_RECIPIENT=0xRecipientAddress...
WATCH_ADDRESS=0xOtherAccountToWatch...
```

---

## 📦 Using the Validity SDK in Your Own Project

You can import the typed helpers from `shared/validity.ts` directly into your dApps, bots, or scripts:

```typescript
import {
  sendRawTransactionValidity,
  createNoncePredicate,
  createBlockPredicate,
  createBalancePredicate,
} from "./shared/validity";

// 1. Sign your raw transaction with viem or ethers
const rawTx = await account.signTransaction({ ... });

// 2. Define predicates
const predicates = [
  // Execute only once account reaches nonce 10
  createNoncePredicate("0xWatchedAccount...", ">=", 10),
  // Expire after block 60000000 (~2 minute timeout)
  createBlockPredicate("<=", 60000000n),
];

// 3. Dispatch to Base Sequencer
const txHash = await sendRawTransactionValidity(
  "https://mainnet-sequencer.base.org",
  rawTx,
  predicates
);

console.log("Validity Transaction parked in sequencer mempool:", txHash);
```

---

## 🚀 Autonomous Keeper Bot Setup

The keeper bot monitors and ratchets trailing stops, fills triggered orders, refunds expired orders, and runs scheduled DCAs.

* **Standard mode:**
  ```bash
  npm run keeper
  ```
* **Native Base Validity Transaction mode** (guarantees orders execute within block expiry ceiling):
  ```bash
  # In .env set:
  VALIDITY_TX=1
  SEQUENCER_RPC_URL=https://mainnet-sequencer.base.org

  npm run keeper
  ```

---

## 📁 Repository Layout

```
├── .github/workflows/       # GitHub Actions automated test & build pipeline
├── contracts/               # Solidity contracts (LimitOrderBook, Adapters, Mocks)
├── keeper/                  # Autonomous keeper bot (keeper.ts)
├── scripts/
│   ├── test-nonce-validity.ts  # Base Nonce Validity CLI test suite
│   ├── deploy.js               # Mainnet deploy script
│   ├── deploy-testnet-mocks.js # Base Sepolia deploy script
│   └── e2e/                    # End-to-end integration scripts
├── shared/
│   ├── validity.ts             # Base Validity Transactions SDK & builders
│   ├── abi.ts                  # Order book contract ABI
│   └── orderMath.ts            # Price calculations & fill-floor helpers
├── test/                    # Hardhat contract test suite (47 tests)
├── .env.example             # Template for environment configuration
└── hardhat.config.js        # Hardhat EVM compiler & network settings
```

---

## 📜 License
ISC
