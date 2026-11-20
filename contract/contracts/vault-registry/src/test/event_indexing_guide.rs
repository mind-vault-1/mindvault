// Documentation validation for #1258: `docs/contract-event-indexing.md` must
// describe exactly the events this contract emits, with struct payloads that
// match the struct definitions in lib.rs.

fn event_guide_catalog() -> std::string::String {
    let guide = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../docs/contract-event-indexing.md"
    ))
    .expect("docs/contract-event-indexing.md must be readable from the vault-registry crate");
    guide
        .split("## Event catalog")
        .nth(1)
        .expect("the guide must have an `## Event catalog` section")
        .split("## Payload semantics")
        .next()
        .expect("`## Event catalog` must be followed by `## Payload semantics`")
        .to_string()
}

/// `(topic, data cell)` for every catalog row.
fn event_guide_rows(catalog: &str) -> std::vec::Vec<(std::string::String, std::string::String)> {
    catalog
        .lines()
        .filter_map(|line| {
            let cells: std::vec::Vec<&str> = line.trim().split('|').map(str::trim).collect();
            // ["", topic, extra topics, data, emitted by, ""]
            if cells.len() < 6 {
                return None;
            }
            let topic = cells[1].strip_prefix('`')?.strip_suffix('`')?;
            Some((topic.to_string(), cells[3].to_string()))
        })
        .collect()
}

/// Field names of `pub struct name { .. }` in lib.rs, in declaration order.
fn struct_fields(lib: &str, name: &str) -> Option<std::vec::Vec<std::string::String>> {
    let start = lib.find(&std::format!("pub struct {name} {{"))?;
    let body = &lib[start..];
    let body = &body[body.find('{')? + 1..body.find("\n}")?];
    Some(
        body.lines()
            .filter_map(|line| line.trim().strip_prefix("pub "))
            .filter_map(|field| field.split(':').next())
            .map(|field| field.trim().to_string())
            .collect(),
    )
}

#[test]
fn event_indexing_guide_covers_every_event() {
    let catalog = event_guide_catalog();
    let rows = event_guide_rows(&catalog);
    let documented: std::vec::Vec<&str> = rows.iter().map(|(topic, _)| topic.as_str()).collect();

    for (topic, _payload) in EVENT_SCHEMA {
        assert!(
            documented.contains(topic),
            "EVENT_SCHEMA lists `{topic}` but docs/contract-event-indexing.md's catalog does not"
        );
    }
    for topic in &documented {
        assert!(
            EVENT_SCHEMA.iter().any(|(t, _)| t == topic),
            "docs/contract-event-indexing.md documents `{topic}`, which is not in EVENT_SCHEMA"
        );
    }
    assert_eq!(
        documented.len(),
        EVENT_SCHEMA.len(),
        "each event must appear exactly once in the guide's catalog"
    );
}

#[test]
fn event_indexing_guide_struct_payloads_match_the_contract() {
    let lib = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
        .expect("lib.rs must be readable");
    let catalog = event_guide_catalog();
    let mut checked = 0;

    for (topic, data) in event_guide_rows(&catalog) {
        // A spelled-out struct payload: `Name { a, b, c }`. `Name { .. }` and
        // a bare `Name` are references, not field lists.
        let Some(open) = data.find(" { ") else { continue };
        let name = data[..open].trim_start_matches('`').trim();
        let Some(close) = data[open..].find(" }") else { continue };
        let listed = &data[open + 3..open + close];
        if listed.trim() == ".." {
            continue;
        }
        let guide_fields: std::vec::Vec<std::string::String> = listed
            .split(',')
            .map(|field| field.split(':').next().unwrap().trim().to_string())
            .collect();
        let fields = struct_fields(&lib, name)
            .unwrap_or_else(|| panic!("`{topic}`: the guide names struct `{name}`, which lib.rs does not define"));
        assert_eq!(
            guide_fields, fields,
            "`{topic}`: the guide's `{name}` fields must match lib.rs, in order"
        );
        checked += 1;
    }

    assert!(checked >= 20, "expected to check most struct payloads, checked {checked}");
}
