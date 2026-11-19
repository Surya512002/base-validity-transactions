# Base Limit Orders & Validity Transactions

A complete implementation of on-chain limit orders, automated DCA, and **Base Validity Transactions** (featuring native `nonce` predicates via Base's sequencer JSON-RPC `base_sendRawTransactionValidity`).

---

## ⚡ What is Included

1. **Smart Contracts (`contracts/`)**:
   - `LimitOrderBook.sol`: Escrow contract supporting Limit Buy, Take-Profit, Stop-Loss, Trailing Stops, Bracket (OCO) orders, and Recurring Buys (DCA).
   - `UniswapV3Adapter.sol`: Swap adapter executing fills directly through Uniswap V3.
   - Built-in oracle-bounded fill guard (Chainlink) and stale-price protection.
2. **Keeper Bot (`keeper/`)**:
   - Autonomous bot that ratchets trailing stops, fills triggered orders, refunds expired orders, and runs scheduled DCAs.
   - Optional native **Base Validity Transaction** mode (`VALIDITY_TX=1`) to prevent late/stale inclusions.
3. **Nonce Validity Tester (`scripts/test-nonce-validity.ts`)**:
   - Ready-to-run demonstration of Base's native `base_sendRawTransactionValidity` method with `nonce` and `block_number` predicates.

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
Create your local `.env` file from the example:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Open `.env` and fill in your values:
* `DEPLOYER_PK`: Your 0x-prefixed private key (needs a small amount of Base Sepolia ETH for live tests).
* `BASE_SEPOLIA_RPC_URL`: `https://sepolia.base.org`
* `BASE_SEPOLIA_SEQUENCER_RPC`: `https://sepolia-sequencer.base.org`

---

## 🧪 Testing

### 1. Test Base Nonce Validity Transactions
Demonstrates sending a pre-signed conditional transaction that is held dormant in the Base sequencer until an account's nonce reaches a target threshold:

```bash
# Run on Base Sepolia (default testnet)
npm run test:validity

# Or run on Base Mainnet:
NETWORK=base npm run test:validity
```

* **Dry-Run Mode (Default):** If no private key or funds are configured, it automatically generates an ephemeral account and verifies the JSON-RPC request schema against the live sequencer.
* **Live Mode (Sepolia or Mainnet):** Set `DEPLOYER_PK` in your `.env`. When the account has gas ETH (e.g. $\ge 0.0001$ ETH):
  1. Signs Tx 2 with nonce $N+1$ and attaches `nonce >= N+1` predicate.
  2. Submits Tx 2 to the Base sequencer (`https://mainnet-sequencer.base.org` or `https://sepolia-sequencer.base.org`).
  3. Verifies Tx 2 remains dormant in the sequencer mempool.
  4. Broadcasts Tx 1 (trigger tx).
  5. The sequencer detects the nonce condition is met and immediately executes Tx 2 in the next block.

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

| Address Parameter | Environment Variable | What it does | Default if omitted |
| :--- | :--- | :--- | :--- |
| **Target Recipient** (`to`) | `TARGET_RECIPIENT` | The destination address that receives the transaction (wallet transfer or contract call). | Sender wallet (safe self-transfer) |
| **Watched Address** (`params.address`) | `WATCH_ADDRESS` | The account whose on-chain protocol nonce the Base sequencer monitors. | Sender wallet (self-trigger) |

---

### 1. Configuration Scenarios (via `.env`)

You can customize the behavior simply by adding or editing values in your `.env` file without altering any TypeScript code:

#### Scenario A: Safe Self-Test (Default)
Executes a 0 ETH self-transfer to prove the sequencer dormancy and instant execution flow without spending or risking any funds:
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
# WATCH_ADDRESS will default to your own address
```

#### Scenario C: Cross-Account Trigger (The Superpower)
Your account pre-signs a transaction (Tx 2) that will **only** execute after a completely different account (e.g., a counterparty, bot, or multisig) completes a transaction:
```env
# .env
DEPLOYER_PK=0xYourPrivateKey...
TARGET_RECIPIENT=0xRecipientAddress...
WATCH_ADDRESS=0xOtherAccountToWatch...
```

---

### 2. Customizing Predicates in Code (`scripts/test-nonce-validity.ts`)

If you want to modify the condition logic in code, inspect `scripts/test-nonce-validity.ts`:

#### Supported Comparison Operators (`op`):
* `">="`: Executes once the watched nonce reaches or exceeds the target (best for guaranteed future execution).
* `"="`: Executes **only** when the watched nonce is exactly the target. If any other transaction increments the nonce past this value, the transaction is permanently invalidated (ideal for **zero-gas cancellation**!).
* `"<="` / `"<"`: Bounds execution to occur before an account makes more transactions.

#### Block Number Timeout Ceiling:
Every validity transaction requires an upper block number bound so the sequencer can safely discard transactions if conditions are never satisfied:
```typescript
const validity = [
  {
    type: "nonce",
    params: {
      address: watchedAddress,   // Configurable: your address or another account
      op: ">=",                  // Operator: >=, =, <=, >, <
      value: toHex(targetNonce), // Target hex nonce (e.g. "0x5")
    },
  },
  {
    type: "block_number",
    params: {
      op: "<=",
      value: toHex(latestBlock + 60n), // ~2 minutes on Base (2s block time)
    },
  },
];
```

---

### 3. Running on Base Mainnet vs. Base Sepolia

Switch networks at any time by updating your `.env` or setting `NETWORK` in your terminal:

* **For Base Sepolia Testnet:**
  ```bash
  npm run test:validity
  ```
* **For Base Mainnet:**
  ```bash
  # PowerShell (Windows)
  $env:NETWORK = "base"; npm run test:validity

  # Bash / macOS / Linux
  NETWORK=base npm run test:validity
  ```

---

## 🚀 Contract Deployment & Keeper Setup

### Deploying the Contracts
To deploy mock contracts to Base Sepolia:
```bash
npm run deploy:sepolia-mocks
```
To deploy the full order book to Base Mainnet:
```bash
npm run deploy
```

### Running the Autonomous Keeper Bot
To run the bot in standard mode:
```bash
npm run keeper
```
To run the bot using native Base Validity Transactions (sequencer-held transactions with block expiry bounds):
```bash
# In .env set:
VALIDITY_TX=1
SEQUENCER_RPC_URL=https://sepolia-sequencer.base.org

npm run keeper
```

---

## 📁 Repository Layout

```
├── contracts/               # Solidity contracts (LimitOrderBook, Adapters, Mocks)
├── keeper/                  # Autonomous keeper bot (keeper.ts)
├── scripts/
│   ├── test-nonce-validity.ts  # Base Nonce Validity Transaction test script
│   ├── deploy.js               # Mainnet deploy script
│   ├── deploy-testnet-mocks.js # Base Sepolia deploy script
│   └── e2e/                    # End-to-end integration scripts
├── shared/                  # Shared ABIs and order math calculations
├── test/                    # Hardhat contract test suite (47 tests)
├── .env.example             # Template for environment configuration
└── hardhat.config.js        # Hardhat EVM compiler & network settings
```

---

## 📜 License
ISC
