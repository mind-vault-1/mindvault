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
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String,
};

// ~5s ledgers → 17,280 per day. Persistent entries are bumped ~30 days on each
// write so an actively-managed resource is never archived out from under us.
const DAY_IN_LEDGERS: u32 = 17280;
const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const LIFETIME_THRESHOLD: u32 = BUMP_AMOUNT - DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Resource {
    pub id: String,
    pub creator: Address,
    pub price: i128,
    pub metadata: String,
    pub listed: bool,
}

#[contracttype]
pub enum DataKey {
    Resource(String),
    Count,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyRegistered = 1,
    NotFound = 2,
    InvalidPrice = 3,
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
    ) -> Result<(), Error> {
        creator.require_auth();
        if price <= 0 {
            return Err(Error::InvalidPrice);
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
            listed: true, // Resources are listed by default when registered
        };
        env.storage().persistent().set(&key, &resource);
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);

        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        env.storage().instance().set(&DataKey::Count, &(count + 1));
        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);

        env.events().publish((symbol_short!("register"), creator), id);
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
        resource.metadata = metadata;
        Self::save(&env, &resource);
        env.events().publish((symbol_short!("updmeta"), id), ());
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

    /// Fetch a resource. Errors with `NotFound` if it does not exist.
    pub fn get(env: Env, id: String) -> Result<Resource, Error> {
        Self::load(&env, &id)
    }

    /// Whether a resource with `id` is registered.
    pub fn exists(env: Env, id: String) -> bool {
        env.storage().persistent().has(&DataKey::Resource(id))
    }

    /// Total number of resources ever registered.
    pub fn count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}

impl VaultRegistry {
    fn load(env: &Env, id: &String) -> Result<Resource, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Resource(id.clone()))
            .ok_or(Error::NotFound)
    }

    fn save(env: &Env, resource: &Resource) {
        let key = DataKey::Resource(resource.id.clone());
        env.storage().persistent().set(&key, resource);
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
    }
}

mod test;
