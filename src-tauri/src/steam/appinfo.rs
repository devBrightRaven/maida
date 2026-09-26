//! Minimal binary appinfo.vdf parser.
//!
//! Format verified against SteamDatabase/SteamAppInfo (README + parser) and
//! SteamDatabase/ValveKeyValue's KV1BinaryReader (2026-08 fetch):
//!
//! Header: magic(u32 LE) + universe(u32 LE) [+ stringTableOffset(i64 LE) for
//! V29 only]. Each app entry: appid(u32, 0 = terminator) + size(u32, bytes
//! from right after this field to the entry's end) + infoState(u32) +
//! lastUpdated(u32) + token(u64) + textHash(20 bytes) + changeNumber(u32) +
//! binaryHash(20 bytes, present in both V28 and V29) + binary KeyValue blob.
//!
//! The binary KeyValue blob is a sequence of (type byte, name, value)
//! entries terminated by an End byte (0x08 or 0x0b). type=0x00 is a nested
//! object; type=0x01 is a null-terminated UTF-8 string; other types are
//! fixed-width numbers we don't care about. In V29, a *name* (never a
//! string *value*) is a u32 index into the file's string table instead of
//! an inline null-terminated string — confirmed via KV1BinaryReader's
//! ReadKeyForNextValue vs. its value-reading switch.
//!
//! We only care about appid -> common.name / common.name_localized, so
//! everything else is skipped without allocating (skip_object/skip_value),
//! and a match on "common" short-circuits the rest of that app's tree once
//! found — the file-level loop always resyncs to the next entry via the
//! `size` field regardless, so one malformed or unrecognized-shape entry
//! never desyncs the rest of the file.

use std::collections::HashMap;
use std::fs;
use std::io::{self, Cursor, Read};
use std::path::Path;

const MAGIC_V28: u32 = 0x0756_4428;
const MAGIC_V29: u32 = 0x0756_4429;

const TYPE_NODE: u8 = 0x00;
const TYPE_STRING: u8 = 0x01;
const TYPE_INT32: u8 = 0x02;
const TYPE_FLOAT32: u8 = 0x03;
const TYPE_POINTER: u8 = 0x04;
const TYPE_WIDESTRING: u8 = 0x05;
const TYPE_COLOR: u8 = 0x06;
const TYPE_UINT64: u8 = 0x07;
const TYPE_END: u8 = 0x08;
const TYPE_INT64: u8 = 0x0a;
const TYPE_END_ALT: u8 = 0x0b;

// A run of 0x00 bytes decodes as TYPE_NODE + empty name every 2 bytes in V28
// mode, so skip_object/skip_value's mutual recursion has no natural bound.
// 64 levels is far beyond any real appinfo.vdf's KV nesting and cheap to
// unwind; anything deeper is treated as malformed (caught by parse_inner's
// per-entry error handling, which resyncs via the size field).
const MAX_KV_DEPTH: u32 = 64;

/// appid -> { steam lang key -> localized title }.
pub type LocalizedTitles = HashMap<String, HashMap<String, String>>;

/// Parse `path` (Steam's appcache/appinfo.vdf). Never errors or panics: any
/// I/O failure, unknown magic, or structural problem degrades to an empty
/// map (logged), matching the app's usual "missing Steam data is normal"
/// posture.
pub fn parse_appinfo_file(path: &Path) -> LocalizedTitles {
    match parse_inner(path) {
        Ok(map) => map,
        Err(e) => {
            log::warn!("[appinfo] failed to parse {}: {}", path.display(), e);
            HashMap::new()
        }
    }
}

fn parse_inner(path: &Path) -> io::Result<LocalizedTitles> {
    let buf = fs::read(path)?;
    let mut cur = Cursor::new(buf.as_slice());
    let magic = read_u32_le(&mut cur)?;
    let _universe = read_u32_le(&mut cur)?;

    let string_table: Option<Vec<String>> = if magic == MAGIC_V29 {
        let offset = read_i64_le(&mut cur)?;
        if offset < 0 || offset as u64 > buf.len() as u64 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "string table offset out of range",
            ));
        }
        let mut table_cur = Cursor::new(&buf[offset as usize..]);
        let count = read_u32_le(&mut table_cur)?;
        // A corrupt count shouldn't balloon memory/CPU: cap the loop itself
        // (not just the preallocation), and stop early on EOF/corruption —
        // a truncated string table is tolerated the same way the rest of
        // this parser tolerates malformed input.
        const MAX_STRING_TABLE_ENTRIES: u32 = 2_000_000;
        let capped_count = count.min(MAX_STRING_TABLE_ENTRIES);
        let mut strings = Vec::with_capacity(capped_count as usize);
        for _ in 0..capped_count {
            match read_cstr(&mut table_cur) {
                Ok(s) => strings.push(s),
                Err(_) => break,
            }
        }
        Some(strings)
    } else if magic == MAGIC_V28 {
        None
    } else {
        log::info!(
            "[appinfo] unknown magic 0x{:08x}, skipping localized-title parsing",
            magic
        );
        return Ok(HashMap::new());
    };
    let table = string_table.as_deref();

    let mut result = HashMap::new();
    loop {
        let appid = match read_u32_le(&mut cur) {
            Ok(v) => v,
            Err(_) => break, // EOF is a normal (if malformed) end of scan
        };
        if appid == 0 {
            break; // well-formed terminator
        }
        let size = match read_u32_le(&mut cur) {
            Ok(v) => v as u64,
            Err(_) => break, // EOF mid-header: same partial-file tolerance as the appid read above
        };
        let entry_end = cur.position() + size;
        if entry_end > buf.len() as u64 {
            log::warn!(
                "[appinfo] app {} entry overruns file bounds, stopping scan",
                appid
            );
            break;
        }

        match read_app_body(&mut cur, &buf, entry_end, table) {
            Ok((name, mut localized)) => {
                // common.name is the storefront default title; use it to
                // fill an "english" gap so the fallback still has *a*
                // Steam-sourced name even when name_localized.english is
                // absent, without overriding an explicit one.
                if !localized.contains_key("english") {
                    if let Some(n) = name {
                        localized.insert("english".to_string(), n);
                    }
                }
                if !localized.is_empty() {
                    result.insert(appid.to_string(), localized);
                }
            }
            Err(e) => {
                log::warn!("[appinfo] skipping app {} after parse error: {}", appid, e);
            }
        }

        // Always resync via the size field: a single bad/unexpected-shape
        // entry never desyncs the rest of the file.
        cur.set_position(entry_end);
    }

    Ok(result)
}

/// Reads the fixed-width per-app header fields, then parses the binary KV
/// blob (bounded to `[cur.position(), entry_end)`) for common.name /
/// common.name_localized.
fn read_app_body(
    cur: &mut Cursor<&[u8]>,
    buf: &[u8],
    entry_end: u64,
    table: Option<&[String]>,
) -> io::Result<(Option<String>, HashMap<String, String>)> {
    let _info_state = read_u32_le(cur)?;
    let _last_updated = read_u32_le(cur)?;
    let _token = read_u64_le(cur)?;
    skip_bytes(cur, 20)?; // text VDF SHA1
    let _change_number = read_u32_le(cur)?;
    skip_bytes(cur, 20)?; // binary VDF SHA1 (present for both V28 and V29)

    let vdf_start = cur.position();
    if vdf_start > entry_end {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "app entry header overruns its own declared size",
        ));
    }
    let mut sub = Cursor::new(&buf[vdf_start as usize..entry_end as usize]);
    extract_app(&mut sub, table)
}

/// Top-level binary KV blob for one app is a single Node entry keyed by the
/// appid-as-string; we don't care about that key, just its children.
fn extract_app(
    cur: &mut Cursor<&[u8]>,
    table: Option<&[String]>,
) -> io::Result<(Option<String>, HashMap<String, String>)> {
    let ty = read_u8(cur)?;
    if ty == TYPE_END || ty == TYPE_END_ALT {
        return Ok((None, HashMap::new()));
    }
    skip_name(cur, table)?;
    if ty != TYPE_NODE {
        // Malformed/unexpected shape: not a node, nothing to recurse into.
        skip_value(cur, ty, table, 0)?;
        return Ok((None, HashMap::new()));
    }

    loop {
        let ty2 = read_u8(cur)?;
        if ty2 == TYPE_END || ty2 == TYPE_END_ALT {
            break;
        }
        let key = read_name(cur, table)?;
        if key == "common" && ty2 == TYPE_NODE {
            // Found what we want; no need to walk extended/depots/config/etc.
            return extract_common_fields(cur, table);
        }
        skip_value(cur, ty2, table, 0)?;
    }
    Ok((None, HashMap::new()))
}

fn extract_common_fields(
    cur: &mut Cursor<&[u8]>,
    table: Option<&[String]>,
) -> io::Result<(Option<String>, HashMap<String, String>)> {
    let mut name = None;
    let mut localized = HashMap::new();
    loop {
        let ty = read_u8(cur)?;
        if ty == TYPE_END || ty == TYPE_END_ALT {
            break;
        }
        let key = read_name(cur, table)?;
        match (key.as_str(), ty) {
            ("name", TYPE_STRING) => {
                name = Some(read_cstr(cur)?);
            }
            ("name_localized", TYPE_NODE) => loop {
                let ty2 = read_u8(cur)?;
                if ty2 == TYPE_END || ty2 == TYPE_END_ALT {
                    break;
                }
                let lang = read_name(cur, table)?;
                if ty2 == TYPE_STRING {
                    localized.insert(lang, read_cstr(cur)?);
                } else {
                    skip_value(cur, ty2, table, 0)?;
                }
            },
            _ => skip_value(cur, ty, table, 0)?,
        }
    }
    Ok((name, localized))
}

fn skip_object(cur: &mut Cursor<&[u8]>, table: Option<&[String]>, depth: u32) -> io::Result<()> {
    if depth > MAX_KV_DEPTH {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "KV nesting too deep",
        ));
    }
    loop {
        let ty = read_u8(cur)?;
        if ty == TYPE_END || ty == TYPE_END_ALT {
            return Ok(());
        }
        skip_name(cur, table)?;
        skip_value(cur, ty, table, depth + 1)?;
    }
}

fn skip_value(
    cur: &mut Cursor<&[u8]>,
    ty: u8,
    table: Option<&[String]>,
    depth: u32,
) -> io::Result<()> {
    match ty {
        TYPE_NODE => skip_object(cur, table, depth),
        TYPE_STRING => skip_cstr(cur),
        TYPE_INT32 | TYPE_POINTER | TYPE_COLOR | TYPE_FLOAT32 => skip_bytes(cur, 4),
        TYPE_UINT64 | TYPE_INT64 => skip_bytes(cur, 8),
        TYPE_WIDESTRING => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unsupported KV type: WideString",
        )),
        other => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("unsupported KV type: 0x{:02x}", other),
        )),
    }
}

fn read_name(cur: &mut Cursor<&[u8]>, table: Option<&[String]>) -> io::Result<String> {
    match table {
        Some(t) => {
            let idx = read_u32_le(cur)? as usize;
            t.get(idx).cloned().ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    "string table index out of range",
                )
            })
        }
        None => read_cstr(cur),
    }
}

fn skip_name(cur: &mut Cursor<&[u8]>, table: Option<&[String]>) -> io::Result<()> {
    match table {
        // Cheap on purpose: no lookup needed to skip a key we don't want.
        Some(_) => {
            read_u32_le(cur)?;
            Ok(())
        }
        None => skip_cstr(cur),
    }
}

fn read_u8(cur: &mut Cursor<&[u8]>) -> io::Result<u8> {
    let mut b = [0u8; 1];
    cur.read_exact(&mut b)?;
    Ok(b[0])
}

fn read_u32_le(cur: &mut Cursor<&[u8]>) -> io::Result<u32> {
    let mut b = [0u8; 4];
    cur.read_exact(&mut b)?;
    Ok(u32::from_le_bytes(b))
}

fn read_u64_le(cur: &mut Cursor<&[u8]>) -> io::Result<u64> {
    let mut b = [0u8; 8];
    cur.read_exact(&mut b)?;
    Ok(u64::from_le_bytes(b))
}

fn read_i64_le(cur: &mut Cursor<&[u8]>) -> io::Result<i64> {
    let mut b = [0u8; 8];
    cur.read_exact(&mut b)?;
    Ok(i64::from_le_bytes(b))
}

fn skip_bytes(cur: &mut Cursor<&[u8]>, n: u64) -> io::Result<()> {
    let mut buf = vec![0u8; n as usize];
    cur.read_exact(&mut buf)?;
    Ok(())
}

fn read_cstr(cur: &mut Cursor<&[u8]>) -> io::Result<String> {
    let start = cur.position() as usize;
    let buf: &[u8] = *cur.get_ref();
    let nul = buf[start..]
        .iter()
        .position(|&b| b == 0)
        .ok_or_else(|| io::Error::new(io::ErrorKind::UnexpectedEof, "unterminated string"))?;
    let s = String::from_utf8_lossy(&buf[start..start + nul]).into_owned();
    cur.set_position((start + nul + 1) as u64);
    Ok(s)
}

fn skip_cstr(cur: &mut Cursor<&[u8]>) -> io::Result<()> {
    let start = cur.position() as usize;
    let buf: &[u8] = *cur.get_ref();
    let nul = buf[start..]
        .iter()
        .position(|&b| b == 0)
        .ok_or_else(|| io::Error::new(io::ErrorKind::UnexpectedEof, "unterminated string"))?;
    cur.set_position((start + nul + 1) as u64);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn cstr_bytes(s: &str) -> Vec<u8> {
        let mut v = s.as_bytes().to_vec();
        v.push(0);
        v
    }

    /// Wraps a fully-built app entry (header fields + binary VDF body) with
    /// the appid + size framing, matching the real per-app layout.
    fn frame_entry(appid: u32, vdf_body: &[u8]) -> Vec<u8> {
        let mut entry = Vec::new();
        entry.extend_from_slice(&0u32.to_le_bytes()); // infoState
        entry.extend_from_slice(&0u32.to_le_bytes()); // lastUpdated
        entry.extend_from_slice(&0u64.to_le_bytes()); // token
        entry.extend_from_slice(&[0u8; 20]); // text SHA1
        entry.extend_from_slice(&0u32.to_le_bytes()); // changeNumber
        entry.extend_from_slice(&[0u8; 20]); // binary SHA1
        entry.extend_from_slice(vdf_body);

        let mut out = Vec::new();
        out.extend_from_slice(&appid.to_le_bytes());
        out.extend_from_slice(&(entry.len() as u32).to_le_bytes());
        out.extend_from_slice(&entry);
        out
    }

    #[test]
    fn test_unknown_magic_returns_empty_map_without_panic() {
        let mut buf = Vec::new();
        buf.extend_from_slice(&0xdead_beefu32.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend_from_slice(&0u32.to_le_bytes()); // terminator (unreached anyway)

        let dir = tempdir().unwrap();
        let path = dir.path().join("appinfo.vdf");
        fs::write(&path, &buf).unwrap();

        assert!(parse_appinfo_file(&path).is_empty());
    }

    #[test]
    fn test_truncated_file_degrades_gracefully() {
        let mut buf = Vec::new();
        buf.extend_from_slice(&MAGIC_V28.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        // No app entries at all, no terminator either — EOF mid-scan.

        let dir = tempdir().unwrap();
        let path = dir.path().join("appinfo.vdf");
        fs::write(&path, &buf).unwrap();

        assert!(parse_appinfo_file(&path).is_empty());
    }

    #[test]
    fn test_v28_synthetic_entry_parses_name_and_localized() {
        // 730 { common { name "Test Game", name_localized { tchinese "測試遊戲" } } }
        let mut body = Vec::new();
        body.push(TYPE_NODE);
        body.extend(cstr_bytes("730"));
        body.push(TYPE_NODE);
        body.extend(cstr_bytes("common"));
        body.push(TYPE_STRING);
        body.extend(cstr_bytes("name"));
        body.extend(cstr_bytes("Test Game"));
        body.push(TYPE_NODE);
        body.extend(cstr_bytes("name_localized"));
        body.push(TYPE_STRING);
        body.extend(cstr_bytes("tchinese"));
        body.extend(cstr_bytes("測試遊戲"));
        body.push(TYPE_END); // end name_localized
        body.push(TYPE_END); // end common
        body.push(TYPE_END); // end "730" node
        body.push(TYPE_END); // end top-level object

        let mut buf = Vec::new();
        buf.extend_from_slice(&MAGIC_V28.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend(frame_entry(730, &body));
        buf.extend_from_slice(&0u32.to_le_bytes()); // terminator

        let dir = tempdir().unwrap();
        let path = dir.path().join("appinfo.vdf");
        fs::write(&path, &buf).unwrap();

        let result = parse_appinfo_file(&path);
        let app = result.get("730").expect("app 730 should be present");
        assert_eq!(app.get("tchinese").map(String::as_str), Some("測試遊戲"));
        // common.name backfills "english" since name_localized had none.
        assert_eq!(app.get("english").map(String::as_str), Some("Test Game"));
    }

    #[test]
    fn test_v29_synthetic_entry_resolves_names_via_string_table() {
        // String table: index -> key name. Values (the actual titles) stay
        // inline even in V29 — only key/name tokens are pooled.
        let table_strings = ["730", "common", "name", "name_localized", "tchinese"];
        let idx = |s: &str| -> u32 { table_strings.iter().position(|&t| t == s).unwrap() as u32 };

        let mut body = Vec::new();
        body.push(TYPE_NODE);
        body.extend(idx("730").to_le_bytes());
        body.push(TYPE_NODE);
        body.extend(idx("common").to_le_bytes());
        body.push(TYPE_STRING);
        body.extend(idx("name").to_le_bytes());
        body.extend(cstr_bytes("Test Game"));
        body.push(TYPE_NODE);
        body.extend(idx("name_localized").to_le_bytes());
        body.push(TYPE_STRING);
        body.extend(idx("tchinese").to_le_bytes());
        body.extend(cstr_bytes("測試遊戲"));
        body.push(TYPE_END);
        body.push(TYPE_END);
        body.push(TYPE_END);
        body.push(TYPE_END);

        let entry = frame_entry(730, &body);

        let mut string_table = Vec::new();
        string_table.extend_from_slice(&(table_strings.len() as u32).to_le_bytes());
        for s in table_strings {
            string_table.extend(cstr_bytes(s));
        }

        // Header: magic, universe, stringTableOffset (absolute, from file
        // start) — placed after the app entries + terminator.
        let header_len = 4 + 4 + 8;
        let table_offset = header_len + entry.len() as u64 + 4 /* terminator */;

        let mut buf = Vec::new();
        buf.extend_from_slice(&MAGIC_V29.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend_from_slice(&(table_offset as i64).to_le_bytes());
        buf.extend(&entry);
        buf.extend_from_slice(&0u32.to_le_bytes()); // terminator
        buf.extend(&string_table);

        let dir = tempdir().unwrap();
        let path = dir.path().join("appinfo.vdf");
        fs::write(&path, &buf).unwrap();

        let result = parse_appinfo_file(&path);
        let app = result.get("730").expect("app 730 should be present");
        assert_eq!(app.get("tchinese").map(String::as_str), Some("測試遊戲"));
        assert_eq!(app.get("english").map(String::as_str), Some("Test Game"));
    }

    #[test]
    fn test_deeply_nested_zeros_does_not_overflow_stack() {
        // A run of 0x00 bytes decodes as TYPE_NODE + empty name every 2
        // bytes in V28 mode (table=None), nesting skip_object/skip_value's
        // mutual recursion arbitrarily deep. Without MAX_KV_DEPTH this
        // overflows the stack (reproduced at ~16KiB); 64KiB proves the
        // bound holds well past that.
        let body = vec![0u8; 64 * 1024];

        let mut buf = Vec::new();
        buf.extend_from_slice(&MAGIC_V28.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        buf.extend(frame_entry(730, &body));
        buf.extend_from_slice(&0u32.to_le_bytes()); // terminator

        let dir = tempdir().unwrap();
        let path = dir.path().join("appinfo.vdf");
        fs::write(&path, &buf).unwrap();

        // Must return (not crash) and yield nothing usable for the malformed entry.
        assert!(parse_appinfo_file(&path).is_empty());
    }

    /// Runs only when this machine actually has a real appinfo.vdf (per the
    /// repo's steam::get_steam_path()); skips cleanly everywhere else.
    #[test]
    fn test_real_appinfo_smoke() {
        let Some(steam_path) = crate::steam::get_steam_path() else {
            eprintln!("[appinfo smoke test] Steam not found on this machine, skipping");
            return;
        };
        let path = steam_path.join("appcache").join("appinfo.vdf");
        if !path.exists() {
            eprintln!("[appinfo smoke test] appinfo.vdf not found, skipping");
            return;
        }

        let result = parse_appinfo_file(&path);
        eprintln!(
            "[appinfo smoke test] parsed {} apps with localized names from {}",
            result.len(),
            path.display()
        );
        assert!(
            !result.is_empty(),
            "expected >0 apps with localized names in the real appinfo.vdf"
        );
    }
}
