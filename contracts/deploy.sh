#!/bin/bash
# Deploy reward_campaign CosmWasm contract to Injective testnet
# Prerequisites: injectived CLI, Rust + wasm32 target

set -e

CONTRACT_DIR="$(dirname "$0")/reward_campaign"
CHAIN_ID="injective-888"
NODE="https://testnet.sentry.tm.injective.network:443"
# Set your key name as configured in injectived
KEY="${KEY:-mykey}"
FROM="$(injectived keys show "$KEY" -a)"

echo "Building contract..."
cd "$CONTRACT_DIR"
cargo build --release --target wasm32-unknown-unknown
wasm-opt -Oz \
  target/wasm32-unknown-unknown/release/reward_campaign.wasm \
  -o reward_campaign_optimized.wasm

echo "Storing contract on chain..."
TX=$(injectived tx wasm store reward_campaign_optimized.wasm \
  --from "$KEY" \
  --chain-id "$CHAIN_ID" \
  --node "$NODE" \
  --gas-prices 500000000inj \
  --gas auto \
  --gas-adjustment 1.3 \
  -y \
  --output json)

echo "$TX" | jq .

CODE_ID=$(echo "$TX" | jq -r '.logs[0].events[] | select(.type=="cosmwasm.wasm.v1.EventCodeStored") | .attributes[] | select(.key=="code_id") | .value')
echo "Code ID: $CODE_ID"

echo "Instantiating contract..."
INIT_TX=$(injectived tx wasm instantiate "$CODE_ID" '{}' \
  --label "RewardBoost" \
  --from "$KEY" \
  --chain-id "$CHAIN_ID" \
  --node "$NODE" \
  --gas-prices 500000000inj \
  --gas auto \
  --gas-adjustment 1.3 \
  --admin "$FROM" \
  -y \
  --output json)

echo "$INIT_TX" | jq .

CONTRACT_ADDR=$(echo "$INIT_TX" | jq -r '.logs[0].events[] | select(.type=="cosmwasm.wasm.v1.EventContractInstantiated") | .attributes[] | select(.key=="contract_address") | .value')
echo ""
echo "=========================================="
echo "CONTRACT ADDRESS: $CONTRACT_ADDR"
echo "=========================================="
echo ""
echo "Add to frontend/.env.local:"
echo "NEXT_PUBLIC_CONTRACT_ADDRESS=$CONTRACT_ADDR"
