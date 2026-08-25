#![no_std]
//! MindVault on-chain vault registry.
//!
//! Records each vault resource on Stellar: its creator, price (in USDC
//! stroops, 7 decimals), and a metadata pointer (e.g. an IPFS URI or content
//! hash). Payment itself still flows through x402 + the USDC SAC off this
//! contract — this registry is the transparent, on-chain source of truth for
//! *what* exists, *who* owns it, and *what it costs*.
//!
//! Only the recorded creator can mutate a resource (enforced via
//! `require_auth`). Ownership can be transferred.

extern crate alloc;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, IntoVal,
    String, Val, Vec,
};

// ~5s ledgers → 17,280 per day. Persistent entries are bumped ~30 days on each
// write so an actively-managed resource is never archived out from under us.
const DAY_IN_LEDGERS: u32 = 17280;
const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const LIFETIME_THRESHOLD: u32 = BUMP_AMOUNT - DAY_IN_LEDGERS;
/// Max length for metadata pointers (IPFS URI, content hash, compact JSON anchor).
pub const MAX_METADATA_POINTER_LEN: u32 = 512;
pub const MAX_TERMS_HASH_LEN: u32 = 64;
const MAX_TAGS: u32 = 8;
/// Maximum price in USDC stroops (6 decimals). Represents 1 trillion USDC.
pub const MAX_PRICE: i128 = 1_000_000_000_000_000_000;
const MAX_TAG_LEN: u32 = 32;

/// On-chain mirror of the server's off-chain verification result. Settable
/// only by an address holding the verifier role (see `add_verifier`).
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VerificationStatus {
    Pending,
    Verified,
    Rejected,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Resource {
    pub id: String,
    pub creator: Address,
    pub price: i128,
    pub metadata: String,
    pub listed: bool,
    /// Discovery labels (e.g. "dataset", "research"). Distinct from `metadata`,
    /// which remains the off-chain content anchor (IPFS URI, content hash, etc.).
    pub tags: Vec<String>,
    /// On-chain verification status, settable only by a verifier.
    pub verified: VerificationStatus,
    /// Once true, `update_metadata` permanently rejects further changes.
    pub frozen: bool,
}

/// One page of the on-chain catalog plus a cursor for the next page.
///
/// `next_cursor` is the catalog index to pass back into `list` / `list_page`
/// as `start`/`cursor`. `None` means end-of-list — clients must not recompute
/// offsets themselves.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CatalogPage {
    pub items: Vec<Resource>,
    pub next_cursor: Option<u32>,
}

#[contracttype]
pub enum DataKey {
    Resource(String),
    Count,
    Index(u32),
    Admin,
    PendingAdmin,
    CreatorTerms(Address),
    CreatorResources(Address),
    CreatorCount(Address),
    PendingTransfer(String),
    Verifier(Address),
}

/// Event data emitted when a resource's metadata pointer is updated.
/// Carries the resource id, the previous metadata pointer, and the new one
/// so that off-chain indexers can build a full audit trail without querying
/// historical ledger state.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MetadataUpdateEvent {
    pub id: String,
    pub old_metadata: String,
    pub new_metadata: String,
}

/// Structured payload published with the `setprice` event.
/// Includes the resource id, the price before and after the update, and the
/// address that authorised the change — enabling indexers to reconcile price
/// history without re-reading contract storage.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PriceUpdated {
    pub id: String,
    pub old_price: i128,
    pub new_price: i128,
    pub updater: Address,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyRegistered = 1,
    NotFound = 2,
    InvalidPrice = 3,
    MetadataTooLong = 4,
    InvalidTag = 5,
    Unauthorized = 6,
    PendingAdminNotSet = 7,
    PendingAdminAlreadySet = 8,
    SameAdmin = 9,
    TermsHashTooLong = 10,
    InvalidResourceId = 11,
    InvalidMetadataPointer = 12,
    EmptyMetadata = 13,
    AlreadyOwner = 14,
    NoPendingTransfer = 15,
    ReservedId = 16,
    PriceExceedsMax = 17,
    AdminNotSet = 18,
    NotVerifier = 19,
    InvalidVerificationTransition = 20,
    AlreadyFrozen = 21,
    MetadataFrozen = 22,
    DuplicateInRepair = 23,
}

#[contract]
pub struct VaultRegistry;

#[contractimpl]
impl VaultRegistry {
    /// Register a new resource. Price is in USDC stroops (6 decimals).
    /// Rejects `price <= 0` (`InvalidPrice`) or `price > MAX_PRICE` (`PriceExceedsMax`).
    /// Requires the creator's authorization.
    pub fn register(
        env: Env,
        creator: Address,
        id: String,
        price: i128,
        metadata: String,
        tags: Vec<String>,
    ) -> Result<(), Error> {
        creator.require_auth();
        Self::validate_price(price)?;
        Self::validate_resource_id(&id)?;
        Self::validate_metadata_pointer(&metadata)?;
        Self::validate_tags(&env, &tags)?;
        if Self::is_reserved_id(&id) {
            return Err(Error::ReservedId);
        }
        let key = DataKey::Resource(id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyRegistered);
        }

        let resource = Resource {
            id: id.clone(),
            creator: creator.clone(),
            price,
            metadata,
            listed: true,
            tags,
            verified: VerificationStatus::Pending,
            frozen: false,
        };
        env.storage().persistent().set(&key, &resource);
        Self::bump_persistent(&env, &key);

        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        let idx_key = DataKey::Index(count);
        env.storage().persistent().set(&idx_key, &id);
        Self::bump_persistent(&env, &idx_key);
        env.storage().instance().set(&DataKey::Count, &(count + 1));
        Self::bump_instance(&env);

        let mut list = Self::creator_list(&env, &creator);
        list.push_back(id.clone());
        env.storage()
            .persistent()
            .set(&Self::creator_key(&env, &creator), &list);
        Self::bump_persistent(&env, &Self::creator_key(&env, &creator));

        let cur = Self::creator_count(&env, &creator);
        Self::set_creator_count(&env, &creator, cur + 1);

        env.events()
            .publish((symbol_short!("register"), creator), resource);
        Ok(())
    }

    /// Update a resource's price. Rejects `new_price <= 0` or `new_price > MAX_PRICE`.
    /// Only the creator may call this.
    ///
    /// Emits a `setprice` event whose data is a [`PriceUpdated`] value
    /// containing `id`, `old_price`, `new_price`, and `updater`.
    pub fn set_price(env: Env, id: String, new_price: i128) -> Result<(), Error> {
        Self::validate_resource_id(&id)?;
        Self::validate_price(new_price)?;
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        let old_price = resource.price;
        let updater = resource.creator.clone();
        resource.price = new_price;
        Self::save(&env, &resource);
        env.events().publish(
            (symbol_short!("setprice"),),
            PriceUpdated {
                id,
                old_price,
                new_price,
                updater,
            },
        );
        Ok(())
    }

    /// Update a resource's metadata pointer. Only the creator may call this.
    ///
    /// Emits a [`MetadataUpdateEvent`] containing the resource id, the previous
    /// metadata pointer (`old_metadata`), and the new one (`new_metadata`).
    /// Off-chain indexers can use these fields to build an audit trail without
    /// querying historical ledger state.
    pub fn update_metadata(env: Env, id: String, metadata: String) -> Result<(), Error> {
        Self::validate_resource_id(&id)?;
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        if resource.frozen {
            return Err(Error::MetadataFrozen);
        }
        Self::validate_metadata_pointer(&metadata)?;
        let old_metadata = resource.metadata.clone();
        resource.metadata = metadata.clone();
        Self::save(&env, &resource);
        env.events().publish(
            (symbol_short!("updmeta"), id.clone()),
            MetadataUpdateEvent {
                id,
                old_metadata,
                new_metadata: metadata,
            },
        );
        Ok(())
    }

    /// Permanently freeze a resource's metadata pointer. Only the creator may
    /// call this. Irreversible — errors `AlreadyFrozen` if called twice.
    /// Price, listing, tags, and ownership remain mutable after freezing.
    pub fn freeze_metadata(env: Env, id: String) -> Result<(), Error> {
        Self::validate_resource_id(&id)?;
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        if resource.frozen {
            return Err(Error::AlreadyFrozen);
        }
        resource.frozen = true;
        Self::save(&env, &resource);
        env.events().publish((symbol_short!("freeze"), id), ());
        Ok(())
    }

    /// Update a resource's on-chain verification status. Only an address
    /// currently holding the verifier role (see `add_verifier`) may call
    /// this. Only `Pending -> Verified`, `Pending -> Rejected`,
    /// `Verified -> Rejected`, and `Rejected -> Verified` are allowed;
    /// self-transitions and reverting to `Pending` error with
    /// `InvalidVerificationTransition`.
    pub fn set_verification_status(
        env: Env,
        id: String,
        verifier: Address,
        status: VerificationStatus,
    ) -> Result<(), Error> {
        verifier.require_auth();
        if !Self::is_verifier(env.clone(), verifier) {
            return Err(Error::NotVerifier);
        }

        Self::validate_resource_id(&id)?;
        let mut resource = Self::load(&env, &id)?;
        let old_status = resource.verified;
        let allowed = matches!(
            (old_status, status),
            (VerificationStatus::Pending, VerificationStatus::Verified)
                | (VerificationStatus::Pending, VerificationStatus::Rejected)
                | (VerificationStatus::Verified, VerificationStatus::Rejected)
                | (VerificationStatus::Rejected, VerificationStatus::Verified)
        );
        if !allowed {
            return Err(Error::InvalidVerificationTransition);
        }

        resource.verified = status;
        Self::save(&env, &resource);
        env.events()
            .publish((symbol_short!("verify"), id), (old_status, status));
        Ok(())
    }

    /// Replace a resource's discovery tags. Only the creator may call this.
    /// Does not modify `metadata` (the off-chain content pointer).
    ///
    /// No-op guard: if `tags` is identical to the resource's current tags
    /// (same values, same order), the call succeeds without touching storage
    /// or emitting a `settags` event.
    pub fn set_tags(env: Env, id: String, tags: Vec<String>) -> Result<(), Error> {
        Self::validate_resource_id(&id)?;
        Self::validate_tags(&env, &tags)?;
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();

        if resource.tags == tags {
            return Ok(());
        }

        // Capture previous tags before replacement for event emission
        let prev_tags = resource.tags.clone();
        resource.tags = tags.clone();
        Self::save(&env, &resource);

        // Emit event with both previous and next tags for indexer reconciliation
        env.events()
            .publish((symbol_short!("settags"), id), (prev_tags, tags));
        Ok(())
    }

    pub fn transfer_ownership(env: Env, id: String, new_creator: Address) -> Result<(), Error> {
        Self::validate_resource_id(&id)?;
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        if resource.creator == new_creator {
            return Err(Error::AlreadyOwner);
        }
        let previous_owner = resource.creator.clone();
        resource.creator = new_creator.clone();
        Self::save(&env, &resource);

        Self::remove_from_creator_index(&env, &previous_owner, &id);
        let prev_count = Self::creator_count(&env, &previous_owner);
        Self::set_creator_count(&env, &previous_owner, prev_count.saturating_sub(1));
        Self::append_to_creator_index(&env, &new_creator, id.clone());
        let new_count = Self::creator_count(&env, &new_creator);
        Self::set_creator_count(&env, &new_creator, new_count + 1);

        let pending_key = DataKey::PendingTransfer(id.clone());
        if env.storage().persistent().has(&pending_key) {
            env.storage().persistent().remove(&pending_key);
        }

        env.events().publish(
            (symbol_short!("transfer"), id),
            (previous_owner, new_creator),
        );
        Ok(())
    }

    /// Propose a transfer to a new owner. The new owner must accept it.
    pub fn propose_transfer(env: Env, id: String, new_creator: Address) -> Result<(), Error> {
        let resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        if resource.creator == new_creator {
            return Err(Error::AlreadyOwner);
        }
        let key = DataKey::PendingTransfer(id.clone());
        env.storage().persistent().set(&key, &new_creator);
        Self::bump_persistent(&env, &key);
        env.events().publish(
            (symbol_short!("propose"), id),
            (resource.creator, new_creator),
        );
        Ok(())
    }

    /// Accept a proposed transfer. Only the pending owner can call this.
    pub fn accept_transfer(env: Env, id: String) -> Result<(), Error> {
        let key = DataKey::PendingTransfer(id.clone());
        let pending_owner: Address = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NoPendingTransfer)?;
        pending_owner.require_auth();

        let mut resource = Self::load(&env, &id)?;
        let previous_owner = resource.creator.clone();
        resource.creator = pending_owner.clone();
        Self::save(&env, &resource);

        env.storage().persistent().remove(&key);

        env.events().publish(
            (symbol_short!("transfer"), id),
            (previous_owner, pending_owner),
        );
        Ok(())
    }

    /// Cancel a proposed transfer. Only the current owner can call this.
    pub fn cancel_transfer(env: Env, id: String) -> Result<(), Error> {
        let resource = Self::load(&env, &id)?;
        resource.creator.require_auth();

        let key = DataKey::PendingTransfer(id.clone());
        if !env.storage().persistent().has(&key) {
            return Err(Error::NoPendingTransfer);
        }
        env.storage().persistent().remove(&key);
        env.events()
            .publish((symbol_short!("cancel"), id), resource.creator);
        Ok(())
    }

    /// Set the listing state of a resource. Only the creator may call this.
    ///
    /// Emits a `setlisted` event with data `(old_listed, new_listed)` so
    /// listeners can distinguish a delist, relist, or no-op transition without
    /// needing to query additional state. The event is always emitted, even
    /// when the new value equals the old value.
    pub fn set_listed(env: Env, id: String, listed: bool) -> Result<(), Error> {
        Self::validate_resource_id(&id)?;
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        let old_listed = resource.listed;
        resource.listed = listed;
        Self::save(&env, &resource);
        env.events()
            .publish((symbol_short!("setlisted"), id), (old_listed, listed));
        Ok(())
    }

    /// Delist a resource (convenience method for set_listed(false)). Only the creator may call this.
    pub fn delist(env: Env, id: String) -> Result<(), Error> {
        Self::set_listed(env, id, false)
    }

    /// Paginated resource list in insertion order. `limit` is capped at 20.
    ///
    /// Kept for callers that only need the page body. Prefer `list_page` when
    /// the client must know the next cursor / end-of-list without recomputing
    /// offsets.
    pub fn list(env: Env, start: u32, limit: u32) -> Vec<Resource> {
        Self::list_page(env, start, limit).items
    }

    /// Paginated catalog page with next-cursor metadata.
    ///
    /// - `cursor` is a 0-based catalog index (same domain as `list`'s `start`).
    /// - `limit` is capped at 20.
    /// - `next_cursor` is `Some(next_index)` when more entries may exist after
    ///   this page, or `None` at end-of-list (including empty catalog / cursor
    ///   past the end).
    pub fn list_page(env: Env, cursor: u32, limit: u32) -> CatalogPage {
        let total: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        let page_size = limit.min(20);
        let mut items: Vec<Resource> = Vec::new(&env);
        let mut i = cursor;
        while i < total && items.len() < page_size {
            if let Some(id) = env
                .storage()
                .persistent()
                .get::<DataKey, String>(&DataKey::Index(i))
            {
                if let Some(resource) = env
                    .storage()
                    .persistent()
                    .get::<DataKey, Resource>(&DataKey::Resource(id))
                {
                    items.push_back(resource);
                }
            }
            i += 1;
        }
        let next_cursor = if i < total { Some(i) } else { None };
        CatalogPage { items, next_cursor }
    }

    /// Paginated list of resources whose `listed` flag is true, in insertion order.
    ///
    /// - Resources are ordered by registration sequence.
    /// - `limit` is capped at `20`.
    /// - Delisted resources are skipped; relisted resources will reappear.
    /// - Returns an empty `Vec` if no listed resources fall in range.
    pub fn list_listed(env: Env, start: u32, limit: u32) -> Vec<Resource> {
        let total: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        let page_size = limit.min(20);
        let mut result: Vec<Resource> = Vec::new(&env);
        let mut i = start;
        while i < total && result.len() < page_size {
            if let Some(id) = env
                .storage()
                .persistent()
                .get::<DataKey, String>(&DataKey::Index(i))
            {
                if let Some(resource) = env
                    .storage()
                    .persistent()
                    .get::<DataKey, Resource>(&DataKey::Resource(id))
                {
                    if resource.listed {
                        result.push_back(resource);
                    }
                }
            }
            i += 1;
        }
        result
    }

    /// Paginated listing of resources owned by `creator` in insertion order.
    ///
    /// - Results are ordered by global registration sequence for that creator.
    /// - `limit` is capped at `20`.
    /// - Returns empty `Vec` when `start` is beyond the creator's known items.
    pub fn list_by_creator(env: Env, creator: Address, start: u32, limit: u32) -> Vec<Resource> {
        let page_size = limit.min(20);
        let mut result: Vec<Resource> = Vec::new(&env);
        if page_size == 0 {
            return result;
        }

        let list = Self::creator_list(&env, &creator);
        let total = list.len();
        if start >= total {
            return result;
        }

        let mut idx = start;
        while result.len() < page_size && idx < total {
            let id = list.get(idx).unwrap();
            if let Some(resource) = env
                .storage()
                .persistent()
                .get::<DataKey, Resource>(&DataKey::Resource(id.clone()))
            {
                result.push_back(resource);
            }
            idx += 1;
        }
        result
    }

    /// Fetch a resource. Errors with `NotFound` if it does not exist.
    pub fn get(env: Env, id: String) -> Result<Resource, Error> {
        Self::validate_resource_id(&id)?;
        Self::load(&env, &id)
    }

    /// Whether a resource with `id` is registered.
    pub fn exists(env: Env, id: String) -> bool {
        Self::validate_resource_id(&id).is_ok()
            && env.storage().persistent().has(&DataKey::Resource(id))
    }

    /// Get the owner address of a resource. Errors with `NotFound` if it does not exist.
    pub fn get_owner(env: Env, id: String) -> Result<Address, Error> {
        Self::validate_resource_id(&id)?;
        let resource = Self::load(&env, &id)?;
        Ok(resource.creator)
    }

    /// Total number of resources successfully registered (monotonic; not decremented on transfer).
    pub fn count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    /// Number of resources currently owned by `creator`. Reflects ownership
    /// transfers (unlike `count`, which is monotonic).
    pub fn creator_resource_count(env: Env, creator: Address) -> u32 {
        Self::creator_count(&env, &creator)
    }

    /// Current contract admin.
    pub fn admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }

    /// Pending nominated contract admin.
    pub fn pending_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    /// Nominate a new contract admin. Only the current admin may call this.
    /// Sets `pending_admin`. The nomination does not take effect until
    /// the pending admin calls `accept_admin`.
    pub fn nominate_new_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        if !env.storage().instance().has(&DataKey::Admin) {
            new_admin.require_auth();
            env.storage().instance().set(&DataKey::Admin, &new_admin);
            Self::bump_instance(&env);
            env.events()
                .publish((symbol_short!("setadmin"),), new_admin);
            return Ok(());
        }

        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        stored_admin.require_auth();

        if new_admin == stored_admin {
            return Err(Error::SameAdmin);
        }
        if env.storage().instance().has(&DataKey::PendingAdmin) {
            return Err(Error::PendingAdminAlreadySet);
        }

        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        Self::bump_instance(&env);
        env.events()
            .publish((symbol_short!("nomadmin"),), new_admin);
        Ok(())
    }

    /// Accept the pending admin nomination and become the contract admin.
    /// Only the pending admin may call this.
    pub fn accept_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let stored_pending: Address = env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::PendingAdmin)
            .ok_or(Error::PendingAdminNotSet)?;

        if stored_pending != new_admin {
            return Err(Error::PendingAdminNotSet);
        }

        new_admin.require_auth();
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Self::bump_instance(&env);
        env.events()
            .publish((symbol_short!("accadmin"),), new_admin);
        Ok(())
    }

    /// Grant the verifier role to `verifier`, authorizing `set_verification_status`.
    /// Only the admin may call this. Errors `AdminNotSet` if no admin has
    /// been set yet (see `nominate_new_admin`).
    pub fn add_verifier(env: Env, verifier: Address) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Verifier(verifier.clone()), &true);
        Self::bump_instance(&env);
        env.events()
            .publish((symbol_short!("addverif"), verifier), true);
        Ok(())
    }

    /// Revoke the verifier role from `verifier`. Only the admin may call this.
    pub fn remove_verifier(env: Env, verifier: Address) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Verifier(verifier.clone()), &false);
        Self::bump_instance(&env);
        env.events()
            .publish((symbol_short!("rmverif"), verifier), false);
        Ok(())
    }

    /// Whether `address` currently holds the verifier role.
    pub fn is_verifier(env: Env, address: Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Verifier(address))
            .unwrap_or(false)
    }

    /// Rebuild the pagination index (`list`/`list_page`/`count`) from an
    /// authoritative, admin-supplied ordered list of resource ids. Only the
    /// admin may call this. Every id must already exist as a registered
    /// `Resource` (else `NotFound`) and the list must not contain duplicates
    /// (else `DuplicateInRepair`). Never touches `Resource` storage itself —
    /// only rewrites the derived `Index`/`Count` pointers, so it's safe to
    /// re-run with the current correct id list as a no-op. See
    /// `docs/index-repair.md` for the full repair strategy.
    pub fn repair_index(env: Env, ids: Vec<String>) -> Result<(), Error> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();

        let len = ids.len();
        for i in 0..len {
            let id = ids.get(i).unwrap();
            if !env
                .storage()
                .persistent()
                .has(&DataKey::Resource(id.clone()))
            {
                return Err(Error::NotFound);
            }
            for j in (i + 1)..len {
                if id == ids.get(j).unwrap() {
                    return Err(Error::DuplicateInRepair);
                }
            }
        }

        let old_count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);

        for i in 0..len {
            let id = ids.get(i).unwrap();
            let idx_key = DataKey::Index(i);
            env.storage().persistent().set(&idx_key, &id);
            Self::bump_persistent(&env, &idx_key);
        }
        env.storage().instance().set(&DataKey::Count, &len);
        Self::bump_instance(&env);

        env.events()
            .publish((symbol_short!("reindex"), old_count), len);
        Ok(())
    }

    /// Store a hash of creator marketplace terms.
    pub fn set_terms_hash(env: Env, creator: Address, terms_hash: String) -> Result<(), Error> {
        creator.require_auth();
        if terms_hash.len() > MAX_TERMS_HASH_LEN {
            return Err(Error::TermsHashTooLong);
        }
        let key = DataKey::CreatorTerms(creator.clone());
        env.storage().persistent().set(&key, &terms_hash);
        Self::bump_persistent(&env, &key);
        env.events()
            .publish((symbol_short!("setterms"), creator), terms_hash);
        Ok(())
    }

    /// Fetch a creator's marketplace terms hash. Errors with `NotFound` if it does not exist.
    pub fn get_terms_hash(env: Env, creator: Address) -> Result<String, Error> {
        let key = DataKey::CreatorTerms(creator);
        env.storage().persistent().get(&key).ok_or(Error::NotFound)
    }
}

impl VaultRegistry {
    fn validate_price(price: i128) -> Result<(), Error> {
        if price <= 0 {
            return Err(Error::InvalidPrice);
        }
        if price > MAX_PRICE {
            return Err(Error::PriceExceedsMax);
        }
        Ok(())
    }

    fn validate_resource_id(id: &String) -> Result<(), Error> {
        let len = id.len();
        if len == 0 || len > 24 {
            return Err(Error::InvalidResourceId);
        }
        let mut buf = alloc::vec![0u8; len as usize];
        id.copy_into_slice(&mut buf);
        for &b in buf.iter() {
            if !(b.is_ascii_lowercase() || b.is_ascii_digit()) {
                return Err(Error::InvalidResourceId);
            }
        }
        Ok(())
    }

    fn is_reserved_id(id: &soroban_sdk::String) -> bool {
        let len = id.len() as usize;
        let mut buf = alloc::vec![0u8; len];
        id.copy_into_slice(&mut buf);
        let eq_ignore_case = |expected: &[u8]| -> bool {
            if buf.len() != expected.len() {
                return false;
            }
            for i in 0..buf.len() {
                let a = buf[i];
                let b = expected[i];
                if a != b && a != b.wrapping_sub(32) && a.wrapping_sub(32) != b {
                    return false;
                }
            }
            true
        };
        eq_ignore_case(b"admin")
            || eq_ignore_case(b"null")
            || eq_ignore_case(b"registry")
            || eq_ignore_case(b"api")
            || eq_ignore_case(b"index")
            || eq_ignore_case(b"root")
            || eq_ignore_case(b"system")
    }

    fn validate_metadata_pointer(metadata: &String) -> Result<(), Error> {
        if metadata.is_empty() {
            return Err(Error::EmptyMetadata);
        }
        if metadata.len() > MAX_METADATA_POINTER_LEN {
            return Err(Error::MetadataTooLong);
        }

        let len = metadata.len() as usize;
        let mut buf = alloc::vec![0u8; len];
        metadata.copy_into_slice(&mut buf);
        let starts_with = |prefix: &[u8]| -> bool {
            if buf.len() < prefix.len() {
                return false;
            }
            buf[..prefix.len()] == *prefix
        };
        if starts_with(b"ipfs://")
            || starts_with(b"ar://")
            || starts_with(b"https://")
            || starts_with(b"http://")
            || starts_with(b"sha256:")
            || starts_with(b"sha-256:")
            || starts_with(b"0x")
        {
            Ok(())
        } else {
            Err(Error::InvalidMetadataPointer)
        }
    }

    fn validate_tags(_env: &Env, tags: &Vec<String>) -> Result<(), Error> {
        if tags.len() > MAX_TAGS {
            return Err(Error::InvalidTag);
        }
        for i in 0..tags.len() {
            let tag = tags.get(i).unwrap();
            let len = tag.len();
            if len == 0 || len > MAX_TAG_LEN {
                return Err(Error::InvalidTag);
            }
        }
        Ok(())
    }

    fn load(env: &Env, id: &String) -> Result<Resource, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Resource(id.clone()))
            .ok_or(Error::NotFound)
    }

    fn save(env: &Env, resource: &Resource) {
        let key = DataKey::Resource(resource.id.clone());
        env.storage().persistent().set(&key, resource);
        Self::bump_persistent(env, &key);
    }

    /// Extend persistent entry TTL when below threshold (Soroban archival safety).
    fn bump_persistent<K>(env: &Env, key: &K)
    where
        K: IntoVal<Env, Val>,
    {
        env.storage()
            .persistent()
            .extend_ttl(key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
    }

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
    }

    fn creator_key(_env: &Env, creator: &Address) -> DataKey {
        DataKey::CreatorResources(creator.clone())
    }

    fn creator_list(env: &Env, creator: &Address) -> Vec<String> {
        env.storage()
            .persistent()
            .get::<DataKey, Vec<String>>(&Self::creator_key(env, creator))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn append_to_creator_index(env: &Env, creator: &Address, id: String) {
        let mut list = Self::creator_list(env, creator);
        list.push_back(id);
        env.storage()
            .persistent()
            .set(&Self::creator_key(env, creator), &list);
        Self::bump_persistent(env, &Self::creator_key(env, creator));
    }

    fn remove_from_creator_index(env: &Env, creator: &Address, id: &String) {
        let list = Self::creator_list(env, creator);
        let mut out: Vec<String> = Vec::new(env);
        for i in 0..list.len() {
            let v = list.get(i).unwrap();
            if v != *id {
                out.push_back(v);
            }
        }
        env.storage()
            .persistent()
            .set(&Self::creator_key(env, creator), &out);
        Self::bump_persistent(env, &Self::creator_key(env, creator));
    }

    fn creator_count(env: &Env, creator: &Address) -> u32 {
        env.storage()
            .instance()
            .get::<_, u32>(&DataKey::CreatorCount(creator.clone()))
            .unwrap_or(0)
    }

    fn set_creator_count(env: &Env, creator: &Address, value: u32) {
        env.storage()
            .instance()
            .set(&DataKey::CreatorCount(creator.clone()), &value);
        Self::bump_instance(env);
    }

    /// The current admin, or `AdminNotSet` if `nominate_new_admin` has never
    /// been called.
    fn require_admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::AdminNotSet)
    }
}

#[cfg(test)]
pub(crate) const TTL_BUMP_AMOUNT: u32 = BUMP_AMOUNT;

mod test;
