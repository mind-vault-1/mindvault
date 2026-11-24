// ─── Fee split preview (#989) ─────────────────────────────────────────────────
//
// Read-only fee split preview: `preview_fee_split` exposes the exact integer
// fee and creator remainder for a proposed sale amount, using the same
// truncating arithmetic as `settle_payment`.
//
// All imports are already in scope via the `include!` of this file into
// `test.rs`, which has `use super::*` and explicit `soroban_sdk` imports.

/// Helper: create an env with admin + fee config set to `(platform_bps, royalty_bps)`.
fn setup_with_fee_config<'a>(
    platform_bps: u32,
    royalty_bps: u32,
) -> (Env, Address, VaultRegistryClient<'a>) {
    let (env, _creator, _admin, client) = setup_with_admin();
    client.set_fee_config(&FeeConfig {
        platform_fee_bps: platform_bps,
        royalty_bps,
        fee_recipient: Some(Address::generate(&env)),
    });
    (env, _creator, client)
}

// ── No fee config ─────────────────────────────────────────────────────────────

#[test]
fn preview_fee_split_no_config_returns_full_amount_to_creator() {
    let (env, _creator, _admin, client) = setup_with_admin();
    // No set_fee_config call — creator should keep everything.
    let preview = client.preview_fee_split(&1_000_000i128);
    assert_eq!(
        preview,
        FeeSplitPreview {
            amount: 1_000_000,
            platform_fee: 0,
            royalty_amount: 0,
            creator_amount: 1_000_000,
            platform_fee_bps: 0,
            royalty_bps: 0,
        }
    );
}

// ── Basic fee split ───────────────────────────────────────────────────────────

#[test]
fn preview_fee_split_platform_only() {
    // 10 % platform fee, 0 % royalty
    let (_env, _creator, client) = setup_with_fee_config(1_000, 0);
    // amount = 1_000_000; platform = 1_000_000 * 1_000 / 10_000 = 100_000
    let preview = client.preview_fee_split(&1_000_000i128);
    assert_eq!(preview.platform_fee, 100_000);
    assert_eq!(preview.royalty_amount, 0);
    assert_eq!(preview.creator_amount, 900_000);
    assert_eq!(preview.platform_fee_bps, 1_000);
    assert_eq!(preview.royalty_bps, 0);
}

#[test]
fn preview_fee_split_royalty_only() {
    // 0 % platform fee, 5 % royalty
    let (_env, _creator, client) = setup_with_fee_config(0, 500);
    let preview = client.preview_fee_split(&2_000_000i128);
    // royalty = 2_000_000 * 500 / 10_000 = 100_000
    assert_eq!(preview.platform_fee, 0);
    assert_eq!(preview.royalty_amount, 100_000);
    assert_eq!(preview.creator_amount, 1_900_000);
}

#[test]
fn preview_fee_split_platform_and_royalty() {
    // 10 % platform + 10 % royalty = 20 % total
    let (_env, _creator, client) = setup_with_fee_config(1_000, 1_000);
    let preview = client.preview_fee_split(&1_000_000i128);
    assert_eq!(preview.platform_fee, 100_000);
    assert_eq!(preview.royalty_amount, 100_000);
    assert_eq!(preview.creator_amount, 800_000);
    assert_eq!(preview.platform_fee_bps, 1_000);
    assert_eq!(preview.royalty_bps, 1_000);
}

// ── Rounding matches settle_payment (truncation) ─────────────────────────────

#[test]
fn preview_fee_split_truncates_like_settle_payment() {
    // 1 % platform (100 bp). amount = 1 stroop → fee = 1 * 100 / 10_000 = 0 (truncated)
    let (_env, _creator, client) = setup_with_fee_config(100, 0);
    let preview = client.preview_fee_split(&1i128);
    assert_eq!(preview.platform_fee, 0);
    assert_eq!(preview.creator_amount, 1);
}

#[test]
fn preview_fee_split_truncates_non_divisible_amount() {
    // 10 % platform. amount = 3 → fee = 3 * 1_000 / 10_000 = 0 (truncated)
    let (_env, _creator, client) = setup_with_fee_config(1_000, 0);
    let preview = client.preview_fee_split(&3i128);
    assert_eq!(preview.platform_fee, 0);
    assert_eq!(preview.creator_amount, 3);

    // amount = 15 → fee = 15 * 1_000 / 10_000 = 1 (truncated from 1.5)
    let preview2 = client.preview_fee_split(&15i128);
    assert_eq!(preview2.platform_fee, 1);
    assert_eq!(preview2.creator_amount, 14);
}

// ── Boundary: amount bounds ───────────────────────────────────────────────────

#[test]
fn preview_fee_split_rejects_zero_amount() {
    let (_env, _creator, client) = setup_with_fee_config(500, 500);
    let res = client.try_preview_fee_split(&0i128);
    assert_eq!(res, Err(Ok(Error::InvalidPrice)));
}

#[test]
fn preview_fee_split_rejects_negative_amount() {
    let (_env, _creator, client) = setup_with_fee_config(500, 500);
    let res = client.try_preview_fee_split(&-1i128);
    assert_eq!(res, Err(Ok(Error::InvalidPrice)));
}

#[test]
fn preview_fee_split_rejects_amount_above_max_price() {
    use crate::MAX_PRICE;
    let (_env, _creator, client) = setup_with_fee_config(500, 500);
    let res = client.try_preview_fee_split(&(MAX_PRICE + 1));
    assert_eq!(res, Err(Ok(Error::InvalidPrice)));
}

#[test]
fn preview_fee_split_accepts_max_price() {
    use crate::MAX_PRICE;
    let (_env, _creator, client) = setup_with_fee_config(1_000, 1_000);
    // Should succeed and return a valid breakdown.
    let preview = client.preview_fee_split(&MAX_PRICE);
    assert_eq!(preview.amount, MAX_PRICE);
    assert!(preview.creator_amount > 0);
    assert_eq!(
        preview.creator_amount,
        MAX_PRICE - preview.platform_fee - preview.royalty_amount
    );
}

#[test]
fn preview_fee_split_accepts_one_stroop() {
    let (_env, _creator, client) = setup_with_fee_config(1_000, 0);
    let preview = client.preview_fee_split(&1i128);
    assert_eq!(preview.amount, 1);
}

// ── Boundary: fee destinations ────────────────────────────────────────────────

#[test]
fn preview_fee_split_max_platform_fee_bps() {
    // MAX_FEE_BPS = 5_000 (50 %)
    let (_env, _creator, client) = setup_with_fee_config(5_000, 0);
    let preview = client.preview_fee_split(&10_000i128);
    // 10_000 * 5_000 / 10_000 = 5_000
    assert_eq!(preview.platform_fee, 5_000);
    assert_eq!(preview.creator_amount, 5_000);
}

#[test]
fn preview_fee_split_max_royalty_bps() {
    let (_env, _creator, client) = setup_with_fee_config(0, 5_000);
    let preview = client.preview_fee_split(&10_000i128);
    assert_eq!(preview.royalty_amount, 5_000);
    assert_eq!(preview.creator_amount, 5_000);
}

#[test]
fn preview_fee_split_max_combined_fee_bps() {
    // platform 2_500 + royalty 2_500 = 5_000 total (max allowed combined)
    let (_env, _creator, client) = setup_with_fee_config(2_500, 2_500);
    let preview = client.preview_fee_split(&10_000i128);
    assert_eq!(preview.platform_fee, 2_500);
    assert_eq!(preview.royalty_amount, 2_500);
    assert_eq!(preview.creator_amount, 5_000);
}

// ── Idempotency ───────────────────────────────────────────────────────────────

#[test]
fn preview_fee_split_is_read_only_and_idempotent() {
    let (_env, _creator, client) = setup_with_fee_config(1_000, 500);
    let amount = 500_000i128;
    let first = client.preview_fee_split(&amount);
    let second = client.preview_fee_split(&amount);
    // Both calls must return identical results and not modify any state.
    assert_eq!(first, second);
}
