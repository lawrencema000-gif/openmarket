#!/bin/bash
# Run targeted tests for changed packages after file edits
CHANGED_FILE="$1"

if [[ "$CHANGED_FILE" == packages/db/* ]]; then
  cd packages/db && pnpm test
elif [[ "$CHANGED_FILE" == packages/contracts/* ]]; then
  cd packages/contracts && pnpm test
elif [[ "$CHANGED_FILE" == services/api/* ]]; then
  cd services/api && pnpm test
fi
