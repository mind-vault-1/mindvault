// ─── Registry migration compatibility report (#1185) ───────────────────────

fn migration_report_register(
    env: &Env,
    creator: &Address,
    client: &VaultRegistryClient,
    id: &str,
) -> String {
    let id = String::from_str(env, id);
    client.register(
        creator,
        &id,
        &100i128,
        &String::from_str(env, "ipfs://migration-report"),
        &tags(env, &["dataset"]),
    );
    id
}

fn migration_report_set_schema(
    env: &Env,
    client: &VaultRegistryClient,
    id: &String,
    schema_version: u32,
) {
    env.as_contract(&client.address, || {
        let key = DataKey::Resource(id.clone());
        let mut stored: Resource = env.storage().persistent().get(&key).unwrap();
        stored.schema_version = schema_version;
        env.storage().persistent().set(&key, &stored);
    });
}

#[test]
fn migration_report_of_an_empty_registry_is_one_empty_final_page() {
    let (_env, _creator, client) = setup();
    let report = client.migration_compatibility_report(&0, &EXPORT_PAGE_CAP);
    assert_eq!(report.report_version, MIGRATION_REPORT_VIEW_VERSION);
    assert_eq!(report.resource_schema_version, RESOURCE_SCHEMA_VERSION);
    assert_eq!(report.previous_schema_version, PREVIOUS_RESOURCE_SCHEMA_VERSION);
    assert_eq!(report.total, 0);
    assert_eq!(report.scanned, 0);
    assert_eq!(report.current_count, 0);
    assert_eq!(report.supported_count, 0);
    assert_eq!(report.unsupported_count, 0);
    assert_eq!(report.next_cursor, None);
}

#[test]
fn migration_report_counts_resources_on_the_current_schema() {
    let (env, creator, client) = setup();
    migration_report_register(&env, &creator, &client, "currenta");
    migration_report_register(&env, &creator, &client, "currentb");

    let report = client.migration_compatibility_report(&0, &EXPORT_PAGE_CAP);
    assert_eq!(report.total, 2);
    assert_eq!(report.scanned, 2);
    assert_eq!(report.current_count, 2);
    assert_eq!(report.supported_count, 0);
    assert_eq!(report.unsupported_count, 0);
    assert_eq!(report.next_cursor, None);
}

#[test]
fn migration_report_buckets_current_previous_and_unsupported_schemas() {
    let (env, creator, client) = setup();
    let current = migration_report_register(&env, &creator, &client, "current");
    let previous = migration_report_register(&env, &creator, &client, "previous");
    let unsupported = migration_report_register(&env, &creator, &client, "unsupported");
    migration_report_set_schema(&env, &client, &previous, PREVIOUS_RESOURCE_SCHEMA_VERSION);
    migration_report_set_schema(&env, &client, &unsupported, RESOURCE_SCHEMA_VERSION + 1);

    let report = client.migration_compatibility_report(&0, &EXPORT_PAGE_CAP);
    assert_eq!(report.total, 3);
    assert_eq!(report.scanned, 3);
    assert_eq!(report.current_count, 1);
    assert_eq!(report.supported_count, 1);
    assert_eq!(report.unsupported_count, 1);
    assert_eq!(report.next_cursor, None);
    assert!(client.exists(&current));
    assert!(client.exists(&previous));
    assert!(client.exists(&unsupported));
}

#[test]
fn migration_report_is_bounded_and_its_cursor_advances() {
    let (env, creator, client) = setup();
    migration_report_register(&env, &creator, &client, "pagea");
    migration_report_register(&env, &creator, &client, "pageb");
    migration_report_register(&env, &creator, &client, "pagec");

    let first = client.migration_compatibility_report(&0, &0);
    assert_eq!(first.scanned, 1);
    assert_eq!(first.current_count, 1);
    assert_eq!(first.next_cursor, Some(1));

    let second = client.migration_compatibility_report(&1, &EXPORT_PAGE_CAP);
    assert_eq!(second.scanned, 2);
    assert_eq!(second.current_count, 2);
    assert_eq!(second.next_cursor, None);

    let past_end = client.migration_compatibility_report(&99, &EXPORT_PAGE_CAP);
    assert_eq!(past_end.total, 3);
    assert_eq!(past_end.scanned, 0);
    assert_eq!(past_end.next_cursor, None);
}

#[test]
fn migration_report_works_while_paused() {
    let (env, creator, admin, client) = setup_with_admin();
    let id = migration_report_register(&env, &creator, &client, "pausedreport");
    migration_report_set_schema(&env, &client, &id, PREVIOUS_RESOURCE_SCHEMA_VERSION);
    client.set_paused(&admin, &true);

    let report = client.migration_compatibility_report(&0, &EXPORT_PAGE_CAP);
    assert_eq!(report.supported_count, 1);
    assert_eq!(report.unsupported_count, 0);
}
