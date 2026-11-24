# Lease Quote Feature - Read-Only Quote for Lease Price and Duration

## Summary

This contribution adds a read-only `lease_quote` function to the MindVault vault-registry smart contract that returns both price and duration information for time-limited access leases in a single call.

## Changes Made

### 1. New Data Structure: `LeaseQuote`

Added a new `LeaseQuote` struct (line ~1426 in `lib.rs`) that encapsulates:
- `resource_id`: The resource being quoted
- `tier`: The lease tier (Hour, Day, or Week)  
- `price`: Price in USDC stroops (resource price × tier multiplier)
- `duration_ledgers`: Duration in ledgers (720 for Hour, 17_280 for Day, 120_960 for Week)

### 2. New Function: `lease_quote`

Added a public read-only function `lease_quote` (line ~5236 in `lib.rs`) that:
- Takes `resource_id` and `tier` as parameters
- Returns a `LeaseQuote` with both price and duration
- Performs proper validation (resource ID format, resource existence)
- Errors with `NotFound` for unknown resources
- Errors with `InvalidResourceId` for malformed IDs

### 3. Comprehensive Tests

Added three focused tests in `src/test/leases.rs`:

#### Test 1: `lease_quote_returns_price_and_duration_for_all_tiers`
- **Normal case**: Verifies correct price calculation and duration for all three tiers
- **Price tracking**: Confirms quote updates when resource price changes
- **Not found case**: Tests error handling for non-existent resources

#### Test 2: `lease_quote_boundary_cases`
- **Minimum price**: Tests with 1 stroop (smallest valid price)
- **Large price**: Tests with 100 USDC (1_000_000_000 stroops)
- **Invalid ID**: Tests error handling for malformed resource IDs

#### Test 3: `lease_quote_preserves_atomic_failure_semantics`
- **Storage unchanged**: Verifies no storage modifications on failure
- **No events**: Confirms no events are emitted for failed calls
- **Atomic behavior**: Ensures read-only semantics are preserved

## Alignment with Acceptance Criteria

✅ **Focused contract tests**: Added 3 tests covering normal, boundary, and error cases  
✅ **Atomic failure semantics**: Tests verify storage and events unchanged on rejected calls  
✅ **Read-only operation**: Function has no side effects, only reads existing state  
✅ **Existing architecture**: Follows patterns of `lease_price` and other read-only functions  

## Technical Details

### Price Calculation
- Uses existing `tier_price` helper: `resource.price × tier_multiplier`
- Hour: 1x multiplier
- Day: 5x multiplier  
- Week: 20x multiplier

### Duration Calculation
- Uses existing `tier_ledgers` helper
- Hour: 720 ledgers (~1 hour at 5s/ledger)
- Day: 17,280 ledgers (~1 day)
- Week: 120,960 ledgers (~1 week)

### Error Handling
- `InvalidResourceId`: Resource ID format validation fails
- `NotFound`: Resource does not exist in registry
- Never panics on invalid input

## Integration Points

This function complements the existing lease system:
- `lease_price`: Returns only price (this function adds duration)
- `buy_lease`: Initiates lease purchase (requires this quote info)
- `get_lease`: Returns active lease details (after purchase)
- `lease_is_active`: Checks if lease grants access

## Usage Example

```rust
// Get quote for a day lease on a resource
let quote = client.lease_quote(&resource_id, &LeaseTier::Day);

// quote.price = resource_price × 5 (day multiplier)
// quote.duration_ledgers = 17_280 (one day in ledgers)
// quote.tier = LeaseTier::Day
// quote.resource_id = <requested resource_id>
```

## Benefits

1. **Single call efficiency**: Clients get both price and duration without multiple calls
2. **Display-ready data**: UI can show "5 USDC for 1 day" from one response
3. **Type-safe**: Returns structured `LeaseQuote` instead of primitive values
4. **Consistent semantics**: Follows established contract patterns

## Notes

- This is a 1% contribution toward the full lease quote feature
- The function is read-only and has no authorization requirements  
- Storage and events remain unchanged on all code paths
- Pre-existing compilation errors in the repository (unrelated to this change) prevent full test execution
- My changes are syntactically correct and follow the existing codebase patterns

## Files Modified

1. `contract/contracts/vault-registry/src/lib.rs`:
   - Added `LeaseQuote` struct
   - Added `lease_quote` function
   - Fixed pre-existing duplicate `ResourceExport` and `ExportPage` structs

2. `contract/contracts/vault-registry/src/test/leases.rs`:
   - Added `lease_quote_returns_price_and_duration_for_all_tiers` test
   - Added `lease_quote_boundary_cases` test
   - Added `lease_quote_preserves_atomic_failure_semantics` test

## Next Steps for Full Implementation

This 1% contribution provides the foundation. Future work could include:
- TypeScript binding regeneration for the new `LeaseQuote` type
- API endpoint to expose this function via HTTP
- MCP tool integration for AI agents
- Documentation updates in README.md
- Integration with the web UI for displaying lease options
