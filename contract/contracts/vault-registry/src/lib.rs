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
const MAX_TAGS: u32 = 8;
const MAX_TAG_LEN: u32 = 32;

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
}

#[contracttype]
pub enum DataKey {
    Resource(String),
    Count,
    Index(u32),
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
}

#[contract]
pub struct VaultRegistry;

#[contractimpl]
impl VaultRegistry {
    /// Register a new resource. Errors if `id` already exists or `price <= 0`.
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
        if price <= 0 {
            return Err(Error::InvalidPrice);
        }
        Self::validate_metadata_pointer(&metadata)?;
        Self::validate_tags(&env, &tags)?;
        let key = DataKey::Resource(id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyRegistered);
        }

        let resource = Resource {
            id: id.clone(),
            creator: creator.clone(),
            price,
            metadata,
            listed: true, // Resources are listed by default when registered
            tags,
        };
        env.storage().persistent().set(&key, &resource);
        Self::bump_persistent(&env, &key);

        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        let idx_key = DataKey::Index(count);
        env.storage().persistent().set(&idx_key, &id);
        Self::bump_persistent(&env, &idx_key);
        env.storage().instance().set(&DataKey::Count, &(count + 1));
        Self::bump_instance(&env);

        env.events()
            .publish((symbol_short!("register"), creator), id);
        Ok(())
    }

    /// Update a resource's price. Only the creator may call this.
    pub fn set_price(env: Env, id: String, new_price: i128) -> Result<(), Error> {
        if new_price <= 0 {
            return Err(Error::InvalidPrice);
        }
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        resource.price = new_price;
        Self::save(&env, &resource);
        env.events()
            .publish((symbol_short!("setprice"), id), new_price);
        Ok(())
    }

    /// Update a resource's metadata pointer. Only the creator may call this.
    pub fn update_metadata(env: Env, id: String, metadata: String) -> Result<(), Error> {
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        Self::validate_metadata_pointer(&metadata)?;
        resource.metadata = metadata;
        Self::save(&env, &resource);
        env.events().publish((symbol_short!("updmeta"), id), ());
        Ok(())
    }

    /// Replace a resource's discovery tags. Only the creator may call this.
    /// Does not modify `metadata` (the off-chain content pointer).
    pub fn set_tags(env: Env, id: String, tags: Vec<String>) -> Result<(), Error> {
        Self::validate_tags(&env, &tags)?;
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        resource.tags = tags.clone();
        Self::save(&env, &resource);
        env.events().publish((symbol_short!("settags"), id), tags);
        Ok(())
    }

    /// Hand ownership to a new creator. Only the current creator may call this.
    pub fn transfer_ownership(env: Env, id: String, new_creator: Address) -> Result<(), Error> {
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        resource.creator = new_creator.clone();
        Self::save(&env, &resource);
        env.events()
            .publish((symbol_short!("transfer"), id), new_creator);
        Ok(())
    }

    /// Set the listing state of a resource. Only the creator may call this.
    pub fn set_listed(env: Env, id: String, listed: bool) -> Result<(), Error> {
        let mut resource = Self::load(&env, &id)?;
        resource.creator.require_auth();
        resource.listed = listed;
        Self::save(&env, &resource);
        env.events()
            .publish((symbol_short!("setlisted"), id), listed);
        Ok(())
    }

    /// Delist a resource (convenience method for set_listed(false)). Only the creator may call this.
    pub fn delist(env: Env, id: String) -> Result<(), Error> {
        Self::set_listed(env, id, false)
    }

    /// Paginated resource list in insertion order. `limit` is capped at 20.
    pub fn list(env: Env, start: u32, limit: u32) -> Vec<Resource> {
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
                    result.push_back(resource);
                }
            }
            i += 1;
        }
        result
    }

    /// Fetch a resource. Errors with `NotFound` if it does not exist.
    pub fn get(env: Env, id: String) -> Result<Resource, Error> {
        Self::load(&env, &id)
    }

    /// Whether a resource with `id` is registered.
    pub fn exists(env: Env, id: String) -> bool {
        env.storage().persistent().has(&DataKey::Resource(id))
    }

    /// Total number of resources successfully registered (monotonic; not decremented on transfer).
    pub fn count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}

impl VaultRegistry {
    fn validate_metadata_pointer(metadata: &String) -> Result<(), Error> {
        if metadata.len() > MAX_METADATA_POINTER_LEN {
            return Err(Error::MetadataTooLong);
        }
        Ok(())
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
}

#[cfg(test)]
pub(crate) const TTL_BUMP_AMOUNT: u32 = BUMP_AMOUNT;

mod test;
