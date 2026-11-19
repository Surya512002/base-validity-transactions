/**
 * Base Validity Transactions SDK & Helpers
 *
 * Provides reusable predicate builders and JSON-RPC dispatchers for Base's
 * `base_sendRawTransactionValidity` method (introduced in the Cobalt upgrade).
 */

import {
  type Address,
  type Hex,
  toHex,
} from "viem";

export type PredicateOperator = "<" | "<=" | "=" | "!=" | ">" | ">=";

export interface NoncePredicate {
  type: "nonce";
  params: {
    address: Address;
    op: PredicateOperator;
    value: Hex;
  };
}

export interface BlockNumberPredicate {
  type: "block_number";
  params: {
    op: PredicateOperator;
    value: Hex;
  };
}

export interface BalancePredicate {
  type: "balance";
  params: {
    address: Address;
    op: PredicateOperator;
    value: Hex;
  };
}

export interface StoragePredicate {
  type: "storage";
  params: {
    address: Address;
    slot: Hex;
    op: PredicateOperator;
    value: Hex;
  };
}

export type ValidityPredicate =
  | NoncePredicate
  | BlockNumberPredicate
  | BalancePredicate
  | StoragePredicate;

export interface ValidityOptions {
  validity: ValidityPredicate[];
}

export interface ValidityRpcResponse {
  jsonrpc: string;
  id: number;
  result?: Hex;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Creates a predicate that checks an account's protocol transaction nonce.
 */
export function createNoncePredicate(
  address: Address,
  op: PredicateOperator,
  targetNonce: bigint | number
): NoncePredicate {
  return {
    type: "nonce",
    params: {
      address,
      op,
      value: toHex(targetNonce),
    },
  };
}

/**
 * Creates a block number predicate (typically used as an upper-bound expiry ceiling).
 */
export function createBlockPredicate(
  op: PredicateOperator,
  blockNumber: bigint | number
): BlockNumberPredicate {
  return {
    type: "block_number",
    params: {
      op,
      value: toHex(blockNumber),
    },
  };
}

/**
 * Creates a balance predicate checking native ETH balance (in wei).
 */
export function createBalancePredicate(
  address: Address,
  op: PredicateOperator,
  weiAmount: bigint
): BalancePredicate {
  return {
    type: "balance",
    params: {
      address,
      op,
      value: toHex(weiAmount),
    },
  };
}

/**
 * Creates a contract storage slot predicate.
 */
export function createStoragePredicate(
  address: Address,
  slot: Hex,
  op: PredicateOperator,
  expectedValue: Hex
): StoragePredicate {
  return {
    type: "storage",
    params: {
      address,
      slot,
      op,
      value: expectedValue,
    },
  };
}

/**
 * Dispatches a signed raw transaction bundled with predicates directly to the Base Sequencer.
 */
export async function sendRawTransactionValidity(
  sequencerRpcUrl: string,
  rawSignedTx: Hex,
  predicates: ValidityPredicate[]
): Promise<Hex> {
  if (!predicates || predicates.length === 0) {
    throw new Error("Validity transactions require at least one predicate.");
  }

  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "base_sendRawTransactionValidity",
    params: [rawSignedTx, { validity: predicates }],
  };

  const response = await fetch(sequencerRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Sequencer HTTP error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ValidityRpcResponse;

  if (data.error) {
    throw new Error(`Sequencer RPC error [${data.error.code}]: ${data.error.message}`);
  }

  if (!data.result) {
    throw new Error("Sequencer returned empty transaction hash.");
  }

  return data.result;
}
