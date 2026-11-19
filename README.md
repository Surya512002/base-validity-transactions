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
git clone https://github.com/<your-username>/<your-repo-name>.git
cd limit-orders
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
npm run test:validity
```

* **Dry-Run Mode (Default):** If no private key or funds are configured, it automatically generates an ephemeral account and verifies the JSON-RPC request schema against the live Base Sepolia sequencer.
* **Live Mode:** Once `DEPLOYER_PK` has $\ge 0.001$ Base Sepolia testnet ETH:
  1. Signs Tx 2 with nonce $N+1$ and attaches `nonce >= N+1` predicate.
  2. Submits Tx 2 to `https://sepolia-sequencer.base.org`.
  3. Verifies Tx 2 remains dormant.
  4. Broadcasts Tx 1 (trigger tx).
  5. The sequencer detects the nonce condition is met and immediately executes Tx 2.

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

## 🛠️ How to Customize & Adapt for Your Project

### Changing Nonce Validity Conditions
Inspect `scripts/test-nonce-validity.ts` to adjust:
* **The target account:** Monitor your own account or a third-party wallet / contract.
* **The operator (`op`):** Supports `>=`, `=`, `<=`, `>`, `<`.
* **The expiry block:** Set `block_number` predicate (`op: "<="`) to control how long the sequencer holds the transaction before discarding it.

```typescript
const validity = [
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
      value: toHex(latestBlock + 60n), // ~2 minutes on Base
    },
  },
];
```

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
