// ─── Consistent Stellar address validation (#1183) ───────────────────────────

#[test]
fn address_validation_rejects_self_as_creator() {
    let (env, _creator, client) = setup();
    let id = String::from_str(&env, "selfcreator");
    let metadata = String::from_str(&env, "ipfs://selfcreator");

    assert_eq!(
        client.try_register(
            &client.address,
            &id,
            &100i128,
            &metadata,
            &empty_tags(&env)
        ),
        Err(Ok(Error::InvalidAddress))
    );
    assert_eq!(client.count(), 0);
    assert!(!client.exists(&id));
}

#[test]
fn address_validation_rejects_self_as_admin_target() {
    let (_env, _creator, client) = setup();

    assert_eq!(
        client.try_nominate_new_admin(&client.address),
        Err(Ok(Error::InvalidAddress))
    );
    assert_eq!(client.admin(), None);
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn address_validation_rejects_self_as_role_target() {
    let (_env, _creator, _admin, client) = setup_with_admin();

    assert_eq!(
        client.try_add_verifier(&client.address),
        Err(Ok(Error::InvalidAddress))
    );
    assert_eq!(
        client.try_add_moderator(&client.address),
        Err(Ok(Error::InvalidAddress))
    );
    assert_eq!(
        client.try_add_settler(&client.address),
        Err(Ok(Error::InvalidAddress))
    );
    assert!(!client.is_verifier(&client.address));
    assert!(!client.is_moderator(&client.address));
    assert!(!client.is_settler(&client.address));
}

#[test]
fn address_validation_rejects_self_as_owner_and_recipient() {
    let (env, creator, client) = setup();
    let id = register_default(&env, &creator, &client, "selfowner");

    assert_eq!(
        client.try_transfer_ownership(&id, &client.address),
        Err(Ok(Error::InvalidAddress))
    );
    assert_eq!(
        client.try_set_royalty_recipient(&id, &Some(client.address.clone())),
        Err(Ok(Error::InvalidAddress))
    );
    assert_eq!(client.get(&id).creator, creator);
    assert_eq!(client.get(&id).royalty_recipient, None);
}

#[test]
fn address_validation_accepts_external_addresses() {
    let (env, creator, _admin, client) = setup_with_admin();
    let id = register_default(&env, &creator, &client, "externaladdr");

    client.add_verifier(&creator);
    assert!(client.is_verifier(&creator));
    assert_eq!(client.get(&id).creator, creator);
}
