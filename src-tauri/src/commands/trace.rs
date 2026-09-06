use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Seek, SeekFrom, Write};
use std::path::Path;
use tauri::AppHandle;

use crate::persistence;

const DEFAULT_TRACE_PAGE_LIMIT: usize = 20;
const MAX_TRACE_PAGE_LIMIT: usize = 50;
const MAX_TRACE_LINE_BYTES: usize = 64 * 1024;
const MAX_TRACE_SCAN_BYTES: usize = 4 * 1024 * 1024;
const MAX_TRACE_SCAN_LINES: usize = 1_000;
const TRACE_READ_CHUNK_BYTES: usize = 8 * 1024;
const MAX_TRACE_LINE_SCAN_BYTES: usize = MAX_TRACE_LINE_BYTES + TRACE_READ_CHUNK_BYTES + 1;
const MAX_SAFE_INTEGER_CURSOR: u64 = 9_007_199_254_740_991;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceSubjectFilter {
    pub namespace: String,
    pub id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TracePage {
    pub events: Vec<Value>,
    pub page_cursor: u64,
    pub next_cursor: Option<u64>,
    pub skipped_lines: usize,
}

enum PreviousLine {
    Complete {
        bytes: Option<Vec<u8>>,
        oversized: bool,
    },
    ScanBudgetReached,
}

/// Append-only trace log. Never pruned by design — it is the prototype's
/// decision-memory record.
#[tauri::command]
pub fn append_trace(app: AppHandle, entry: Value) -> Result<(), String> {
    let base = persistence::app_data_dir(&app);
    persistence::ensure_dir(&base);
    let path = persistence::trace_path(&base);

    let mut enriched = entry;
    // IndexMut on a non-object Value panics; reject instead.
    if !enriched.is_object() {
        return Err("trace entry must be a JSON object".into());
    }
    if enriched.get("recordedAt").is_none() {
        enriched["recordedAt"] = serde_json::json!(Utc::now().to_rfc3339());
    }

    let line = serde_json::to_string(&enriched).map_err(|e| e.to_string())?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open trace: {}", e))?;

    writeln!(file, "{}", line).map_err(|e| format!("write trace: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn export_trace(app: AppHandle) -> Result<String, String> {
    let base = persistence::app_data_dir(&app);
    let path = persistence::trace_path(&base);

    if !path.exists() {
        return Err("No trace found.".to_string());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content)
}

/// Read decision history newest-first without loading the append-only log into
/// memory. The cursor is an exclusive byte offset into the snapshot observed
/// by the first request; callers pass `nextCursor` back unchanged.
#[tauri::command]
pub fn read_trace_page(
    app: AppHandle,
    cursor: Option<u64>,
    limit: Option<usize>,
    subject: Option<TraceSubjectFilter>,
) -> Result<TracePage, String> {
    let base = persistence::app_data_dir(&app);
    let path = persistence::trace_path(&base);
    read_trace_page_from_path(&path, cursor, limit, subject.as_ref())
}

fn empty_trace_page() -> TracePage {
    TracePage {
        events: Vec::new(),
        page_cursor: 0,
        next_cursor: None,
        skipped_lines: 0,
    }
}

fn read_trace_page_from_path(
    path: &Path,
    cursor: Option<u64>,
    limit: Option<usize>,
    subject: Option<&TraceSubjectFilter>,
) -> Result<TracePage, String> {
    if cursor.is_some_and(|value| value > MAX_SAFE_INTEGER_CURSOR) {
        return Err(format!(
            "trace cursor exceeds JavaScript safe integer limit ({MAX_SAFE_INTEGER_CURSOR})"
        ));
    }
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(empty_trace_page()),
        Err(error) => return Err(format!("open trace: {error}")),
    };
    let file_len = file
        .metadata()
        .map_err(|error| format!("read trace metadata: {error}"))?
        .len();
    if file_len > MAX_SAFE_INTEGER_CURSOR {
        return Err(format!(
            "trace file exceeds JavaScript safe integer cursor limit ({MAX_SAFE_INTEGER_CURSOR})"
        ));
    }
    if file_len == 0 {
        return Ok(empty_trace_page());
    }

    let requested_cursor = cursor;
    let mut position = cursor.unwrap_or(file_len).min(file_len);
    let mut page_cursor = position;
    let mut scanned_bytes = 0usize;

    // A caller-provided offset can be truncated or point into a line. Skip the
    // partial line so it can never be surfaced as a corrupt synthetic event.
    // Cursors returned by this function always sit at a line boundary.
    if requested_cursor.is_some() && position < file_len && position > 0 {
        let preceding = read_byte_at(&mut file, position - 1)?;
        scanned_bytes += 1;
        if preceding != b'\n' {
            match seek_to_line_start(
                &mut file,
                &mut position,
                &mut scanned_bytes,
                MAX_TRACE_SCAN_BYTES,
            )? {
                true => page_cursor = position,
                false => {
                    return Ok(TracePage {
                        events: Vec::new(),
                        page_cursor,
                        next_cursor: (position > 0).then_some(position),
                        skipped_lines: 0,
                    });
                }
            }
        }
    }

    let page_limit = limit
        .unwrap_or(DEFAULT_TRACE_PAGE_LIMIT)
        .clamp(1, MAX_TRACE_PAGE_LIMIT);
    let mut events = Vec::with_capacity(page_limit);
    let mut skipped_lines = 0usize;
    let mut scanned_lines = 0usize;

    while position > 0
        && events.len() < page_limit
        && scanned_lines < MAX_TRACE_SCAN_LINES
        && MAX_TRACE_SCAN_BYTES.saturating_sub(scanned_bytes) >= MAX_TRACE_LINE_SCAN_BYTES
    {
        match read_previous_line(
            &mut file,
            &mut position,
            &mut scanned_bytes,
            MAX_TRACE_SCAN_BYTES,
        )? {
            PreviousLine::ScanBudgetReached => break,
            PreviousLine::Complete { bytes, oversized } => {
                scanned_lines += 1;
                if oversized {
                    skipped_lines += 1;
                    continue;
                }
                let Some(mut bytes) = bytes else {
                    skipped_lines += 1;
                    continue;
                };
                if bytes.last() == Some(&b'\r') {
                    bytes.pop();
                }
                if bytes.is_empty() {
                    skipped_lines += 1;
                    continue;
                }
                let value: Value = match serde_json::from_slice(&bytes) {
                    Ok(Value::Object(object)) => Value::Object(object),
                    Ok(_) | Err(_) => {
                        skipped_lines += 1;
                        continue;
                    }
                };
                if is_boot_snapshot(&value) || !matches_subject(&value, subject) {
                    continue;
                }
                events.push(value);
            }
        }
    }

    Ok(TracePage {
        events,
        page_cursor,
        next_cursor: (position > 0).then_some(position),
        skipped_lines,
    })
}

fn is_boot_snapshot(value: &Value) -> bool {
    matches!(
        value.get("eventType").and_then(Value::as_str),
        Some("maida.decision.presented" | "maida.playtime.snapshot")
    )
}

fn matches_subject(value: &Value, filter: Option<&TraceSubjectFilter>) -> bool {
    let Some(filter) = filter else {
        return true;
    };
    value
        .get("subject")
        .and_then(Value::as_object)
        .is_some_and(|subject| {
            subject.get("namespace").and_then(Value::as_str) == Some(filter.namespace.as_str())
                && subject.get("id").and_then(Value::as_str) == Some(filter.id.as_str())
        })
}

fn read_byte_at(file: &mut File, offset: u64) -> Result<u8, String> {
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| format!("seek trace: {error}"))?;
    let mut byte = [0u8; 1];
    file.read_exact(&mut byte)
        .map_err(|error| format!("read trace: {error}"))?;
    Ok(byte[0])
}

/// Align an arbitrary cursor to the beginning of its current line. Returns
/// false if the per-request byte budget is exhausted first; `position` still
/// advances so a subsequent request can continue through adversarial input.
fn seek_to_line_start(
    file: &mut File,
    position: &mut u64,
    scanned_bytes: &mut usize,
    byte_budget: usize,
) -> Result<bool, String> {
    while *position > 0 && *scanned_bytes < byte_budget {
        let available = byte_budget - *scanned_bytes;
        let chunk_len = TRACE_READ_CHUNK_BYTES
            .min(*position as usize)
            .min(available);
        if chunk_len == 0 {
            break;
        }
        let start = *position - chunk_len as u64;
        let mut chunk = vec![0u8; chunk_len];
        file.seek(SeekFrom::Start(start))
            .map_err(|error| format!("seek trace: {error}"))?;
        file.read_exact(&mut chunk)
            .map_err(|error| format!("read trace: {error}"))?;
        *scanned_bytes += chunk_len;
        if let Some(index) = chunk.iter().rposition(|byte| *byte == b'\n') {
            *position = start + index as u64 + 1;
            return Ok(true);
        }
        *position = start;
    }
    Ok(*position == 0)
}

fn read_previous_line(
    file: &mut File,
    position: &mut u64,
    scanned_bytes: &mut usize,
    byte_budget: usize,
) -> Result<PreviousLine, String> {
    if *position == 0 {
        return Ok(PreviousLine::Complete {
            bytes: Some(Vec::new()),
            oversized: false,
        });
    }
    if byte_budget.saturating_sub(*scanned_bytes) < 2 {
        return Ok(PreviousLine::ScanBudgetReached);
    }

    // Returned cursors point to the first byte of the next-newer line. Consume
    // its preceding newline before collecting the older line.
    if *scanned_bytes < byte_budget && read_byte_at(file, *position - 1)? == b'\n' {
        *position -= 1;
        *scanned_bytes += 1;
    }

    let mut reversed_fragments: Vec<Vec<u8>> = Vec::new();
    let mut retained_len = 0usize;
    let mut oversized = false;

    loop {
        if *position == 0 {
            break;
        }
        if *scanned_bytes >= byte_budget {
            return Ok(PreviousLine::ScanBudgetReached);
        }
        let available = byte_budget - *scanned_bytes;
        let chunk_len = TRACE_READ_CHUNK_BYTES
            .min(*position as usize)
            .min(available);
        if chunk_len == 0 {
            return Ok(PreviousLine::ScanBudgetReached);
        }
        let start = *position - chunk_len as u64;
        let mut chunk = vec![0u8; chunk_len];
        file.seek(SeekFrom::Start(start))
            .map_err(|error| format!("seek trace: {error}"))?;
        file.read_exact(&mut chunk)
            .map_err(|error| format!("read trace: {error}"))?;
        *scanned_bytes += chunk_len;

        if let Some(index) = chunk.iter().rposition(|byte| *byte == b'\n') {
            let fragment = chunk[index + 1..].to_vec();
            retain_fragment(
                fragment,
                &mut reversed_fragments,
                &mut retained_len,
                &mut oversized,
            );
            *position = start + index as u64 + 1;
            break;
        }

        retain_fragment(
            chunk,
            &mut reversed_fragments,
            &mut retained_len,
            &mut oversized,
        );
        *position = start;
    }

    if oversized {
        return Ok(PreviousLine::Complete {
            bytes: None,
            oversized: true,
        });
    }
    let mut bytes = Vec::with_capacity(retained_len);
    for fragment in reversed_fragments.into_iter().rev() {
        bytes.extend(fragment);
    }
    Ok(PreviousLine::Complete {
        bytes: Some(bytes),
        oversized: false,
    })
}

fn retain_fragment(
    fragment: Vec<u8>,
    reversed_fragments: &mut Vec<Vec<u8>>,
    retained_len: &mut usize,
    oversized: &mut bool,
) {
    if *oversized {
        return;
    }
    if *retained_len + fragment.len() > MAX_TRACE_LINE_BYTES {
        *oversized = true;
        reversed_fragments.clear();
        *retained_len = 0;
        return;
    }
    *retained_len += fragment.len();
    reversed_fragments.push(fragment);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::path::Path;
    use tempfile::tempdir;

    fn event(id: &str, event_type: &str, namespace: &str, subject_id: &str) -> Value {
        json!({
            "schemaVersion": 1,
            "eventId": id,
            "eventType": event_type,
            "subject": { "namespace": namespace, "id": subject_id },
            "recordedAt": "2026-09-06T00:00:00Z",
            "payload": {}
        })
    }

    fn write_lines(path: &Path, lines: &[String]) {
        let mut file = fs::File::create(path).unwrap();
        for line in lines {
            writeln!(file, "{line}").unwrap();
        }
    }

    fn ids(page: &TracePage) -> Vec<&str> {
        page.events
            .iter()
            .map(|value| value["eventId"].as_str().unwrap())
            .collect()
    }

    #[test]
    fn paginates_newest_first_with_unicode_and_clamps_limit() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("trace.jsonl");
        let lines: Vec<_> = (0..55)
            .map(|index| {
                let mut value = event(&format!("e{index}"), "maida.hook.created", "steam", "1");
                value["payload"] = json!({ "note": format!("記得第 {index} 件事 🎮") });
                serde_json::to_string(&value).unwrap()
            })
            .collect();
        write_lines(&path, &lines);

        let default_page = read_trace_page_from_path(&path, None, None, None).unwrap();
        assert_eq!(default_page.events.len(), 20);
        assert_eq!(default_page.events[0]["eventId"], "e54");
        assert_eq!(default_page.events[19]["eventId"], "e35");

        let first = read_trace_page_from_path(&path, None, Some(500), None).unwrap();
        assert_eq!(first.events.len(), 50);
        assert_eq!(first.events[0]["eventId"], "e54");
        assert_eq!(first.events[49]["eventId"], "e5");
        assert_eq!(first.events[0]["payload"]["note"], "記得第 54 件事 🎮");
        assert_eq!(first.skipped_lines, 0);
        assert_eq!(first.page_cursor, fs::metadata(&path).unwrap().len());
        assert!(first.next_cursor.is_some());

        let second = read_trace_page_from_path(&path, first.next_cursor, None, None).unwrap();
        assert_eq!(ids(&second), vec!["e4", "e3", "e2", "e1", "e0"]);
        assert_eq!(second.next_cursor, None);
    }

    #[test]
    fn subject_filter_skips_boot_snapshots_and_keeps_unknown_events_readable() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("trace.jsonl");
        let mut choice = event("choice", "maida.choice.recorded", "steam", "42");
        choice["payload"] = json!({ "action": "not_now" });
        let mut future = event("future", "maida.future.event", "steam", "42");
        future["payload"] = json!({ "futureField": "still visible" });
        let lines = [
            event("hook", "maida.hook.created", "steam", "42"),
            event("presented", "maida.decision.presented", "maida", "library"),
            event("other", "maida.game.state_set", "steam", "99"),
            choice,
            event("snapshot", "maida.playtime.snapshot", "maida", "library"),
            future,
        ]
        .into_iter()
        .map(|value| serde_json::to_string(&value).unwrap())
        .collect::<Vec<_>>();
        write_lines(&path, &lines);

        let filter = TraceSubjectFilter {
            namespace: "steam".into(),
            id: "42".into(),
        };
        let page = read_trace_page_from_path(&path, None, Some(20), Some(&filter)).unwrap();

        assert_eq!(ids(&page), vec!["future", "choice", "hook"]);
        assert_eq!(page.events[0]["payload"]["futureField"], "still visible");
        assert_eq!(page.events[1]["payload"]["action"], "not_now");
        assert_eq!(page.skipped_lines, 0);
        assert_eq!(page.next_cursor, None);
    }

    #[test]
    fn corrupt_oversized_and_truncated_lines_are_skipped_without_losing_older_data() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("trace.jsonl");
        let valid =
            serde_json::to_string(&event("valid", "maida.launch.initiated", "steam", "7")).unwrap();
        let oversized = "x".repeat(MAX_TRACE_LINE_BYTES + 1);
        let mut file = fs::File::create(&path).unwrap();
        writeln!(file, "{valid}").unwrap();
        writeln!(file, "not json").unwrap();
        writeln!(file, "{oversized}").unwrap();
        write!(file, "{{\"eventId\":\"unfinished\"").unwrap();

        let page = read_trace_page_from_path(&path, None, Some(20), None).unwrap();

        assert_eq!(ids(&page), vec!["valid"]);
        assert_eq!(page.skipped_lines, 3);
        assert_eq!(page.next_cursor, None);
    }

    #[test]
    fn cursor_inside_a_line_resumes_before_that_line() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("trace.jsonl");
        let lines = ["old", "middle", "new"].map(|id| {
            serde_json::to_string(&event(id, "maida.hook.created", "steam", "1")).unwrap()
        });
        write_lines(&path, &lines);
        let content = fs::read(&path).unwrap();
        let middle_start = content
            .windows(b"\n".len())
            .position(|window| window == b"\n")
            .unwrap()
            + 1;
        let truncated_cursor = (middle_start + 12) as u64;

        let page =
            read_trace_page_from_path(&path, Some(truncated_cursor), Some(20), None).unwrap();

        assert_eq!(ids(&page), vec!["old"]);
        assert_eq!(page.skipped_lines, 0);
        assert_eq!(page.next_cursor, None);
    }

    #[test]
    fn cursor_from_before_file_truncation_clamps_to_the_new_eof() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("trace.jsonl");
        let old = serde_json::to_string(&event("old", "maida.hook.created", "steam", "1")).unwrap();
        let removed =
            serde_json::to_string(&event("removed", "maida.hook.created", "steam", "1")).unwrap();
        write_lines(&path, &[old.clone(), removed]);
        let stale_cursor = fs::metadata(&path).unwrap().len();
        write_lines(&path, &[old]);
        let new_eof = fs::metadata(&path).unwrap().len();

        let page = read_trace_page_from_path(&path, Some(stale_cursor), Some(20), None).unwrap();

        assert_eq!(ids(&page), vec!["old"]);
        assert_eq!(page.page_cursor, new_eof);
        assert_eq!(page.next_cursor, None);
    }

    #[test]
    fn cursor_snapshot_is_stable_when_new_events_are_appended() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("trace.jsonl");
        let lines = ["old", "middle", "new"].map(|id| {
            serde_json::to_string(&event(id, "maida.hook.created", "steam", "1")).unwrap()
        });
        write_lines(&path, &lines);

        let first = read_trace_page_from_path(&path, None, Some(2), None).unwrap();
        assert_eq!(ids(&first), vec!["new", "middle"]);
        let first_page_cursor = first.page_cursor;
        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        writeln!(
            file,
            "{}",
            serde_json::to_string(&event("appended", "maida.hook.created", "steam", "1")).unwrap()
        )
        .unwrap();

        let second = read_trace_page_from_path(&path, first.next_cursor, Some(2), None).unwrap();
        assert_eq!(ids(&second), vec!["old"]);
        assert_eq!(second.next_cursor, None);

        let reread_first =
            read_trace_page_from_path(&path, Some(first_page_cursor), Some(2), None).unwrap();
        assert_eq!(ids(&reread_first), vec!["new", "middle"]);
        assert_eq!(reread_first.page_cursor, first_page_cursor);
    }

    #[test]
    fn sparse_filter_and_bad_lines_still_advance_the_cursor() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("trace.jsonl");
        let mut lines =
            vec![
                serde_json::to_string(&event("target", "maida.hook.created", "steam", "42"))
                    .unwrap(),
            ];
        for index in 0..MAX_TRACE_SCAN_LINES {
            lines.push(
                serde_json::to_string(&event(
                    &format!("other-{index}"),
                    "maida.hook.created",
                    "steam",
                    "99",
                ))
                .unwrap(),
            );
        }
        lines.push("broken".into());
        write_lines(&path, &lines);
        let filter = TraceSubjectFilter {
            namespace: "steam".into(),
            id: "42".into(),
        };

        let first = read_trace_page_from_path(&path, None, Some(1), Some(&filter)).unwrap();
        assert!(first.events.is_empty());
        assert_eq!(first.skipped_lines, 1);
        let cursor = first
            .next_cursor
            .expect("scan budget must return a resumable cursor");

        let second =
            read_trace_page_from_path(&path, Some(cursor), Some(1), Some(&filter)).unwrap();
        assert_eq!(ids(&second), vec!["target"]);
        assert_eq!(second.next_cursor, None);
    }

    #[test]
    fn missing_file_is_empty_but_other_read_errors_surface() {
        let dir = tempdir().unwrap();
        let missing = dir.path().join("missing.jsonl");
        let page = read_trace_page_from_path(&missing, None, None, None).unwrap();
        assert!(page.events.is_empty());
        assert_eq!(page.page_cursor, 0);
        assert_eq!(page.next_cursor, None);
        assert_eq!(page.skipped_lines, 0);

        let error = read_trace_page_from_path(dir.path(), None, None, None).unwrap_err();
        assert!(error.contains("open trace"), "unexpected error: {error}");
    }

    #[test]
    fn rejects_cursors_that_javascript_cannot_represent_exactly() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("trace.jsonl");
        write_lines(
            &path,
            &[serde_json::to_string(&event("one", "maida.hook.created", "steam", "1")).unwrap()],
        );

        let error = read_trace_page_from_path(&path, Some(9_007_199_254_740_992), Some(20), None)
            .unwrap_err();

        assert!(error.contains("safe integer"), "unexpected error: {error}");
    }

    #[test]
    fn scan_budget_stop_keeps_a_line_boundary_cursor() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("trace.jsonl");
        write_lines(
            &path,
            &[serde_json::to_string(&event("one", "maida.hook.created", "steam", "1")).unwrap()],
        );
        let mut file = File::open(&path).unwrap();
        let mut position = fs::metadata(&path).unwrap().len();
        let original_position = position;
        let mut scanned_bytes = MAX_TRACE_SCAN_BYTES - 1;

        let result = read_previous_line(
            &mut file,
            &mut position,
            &mut scanned_bytes,
            MAX_TRACE_SCAN_BYTES,
        )
        .unwrap();

        assert!(matches!(result, PreviousLine::ScanBudgetReached));
        assert_eq!(position, original_position);
    }
}
