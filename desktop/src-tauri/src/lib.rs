use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

#[derive(Default)]
struct CaptureState {
    running: bool,
    failed: bool,
    session_id: String,
    course_name: String,
    started_at_unix: u64,
    transcript_chunks: Vec<String>,
    retry_count: u32,
    last_error: Option<String>,
}

#[derive(Serialize)]
struct CaptureStatus {
    running: bool,
    failed: bool,
    session_id: String,
    course_name: String,
    started_at_unix: u64,
    duration_seconds: u64,
    chunk_count: usize,
    retry_count: u32,
    last_error: Option<String>,
}

#[derive(Serialize)]
struct CaptureResult {
    session_id: String,
    duration_seconds: u64,
    transcript: String,
    chunk_count: usize,
}

#[derive(Serialize)]
struct TranscriptionResult {
    session_id: String,
    course_name: String,
    duration_seconds: u64,
    transcript: String,
    chunk_count: usize,
    source: String,
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Mnemo.", name)
}

#[tauri::command]
fn start_audio_capture(course_name: Option<String>, state: State<'_, Arc<Mutex<CaptureState>>>) -> Result<CaptureStatus, String> {
    let mut st = state.inner().lock().map_err(|_| "failed to lock capture state".to_string())?;
    if st.running {
        return Err("audio capture already running".to_string());
    }
    let ts = now_unix();
    st.running = true;
    st.failed = false;
    st.session_id = format!("cap-{}", ts);
    st.course_name = course_name.unwrap_or_else(|| "未命名课程".to_string());
    st.started_at_unix = ts;
    st.transcript_chunks.clear();
    st.retry_count = 0;
    st.last_error = None;

    let session_id = st.session_id.clone();
    drop(st);

    let state_for_worker = state.inner().clone();
    thread::spawn(move || {
        let mut idx: u64 = 1;
        loop {
            thread::sleep(Duration::from_secs(2));
            let mut guard = match state_for_worker.lock() {
                Ok(g) => g,
                Err(_) => break,
            };
            if !guard.running || guard.session_id != session_id {
                break;
            }
            guard.transcript_chunks.push(format!("transcript_chunk_{}", idx));
            if idx % 10 == 0 {
                guard.transcript_chunks.push("[asr] partial result stabilized".to_string());
            }
            idx += 1;
        }
    });

    let st = state.inner().lock().map_err(|_| "failed to lock capture state".to_string())?;
    Ok(CaptureStatus {
        running: st.running,
        failed: st.failed,
        session_id: st.session_id.clone(),
        course_name: st.course_name.clone(),
        started_at_unix: st.started_at_unix,
        duration_seconds: 0,
        chunk_count: st.transcript_chunks.len(),
        retry_count: st.retry_count,
        last_error: st.last_error.clone(),
    })
}

#[tauri::command]
fn get_audio_capture_status(state: State<'_, Arc<Mutex<CaptureState>>>) -> Result<CaptureStatus, String> {
    let st = state.inner().lock().map_err(|_| "failed to lock capture state".to_string())?;
    let duration_seconds = if st.running && st.started_at_unix > 0 {
        now_unix().saturating_sub(st.started_at_unix)
    } else {
        0
    };
    Ok(CaptureStatus {
        running: st.running,
        failed: st.failed,
        session_id: st.session_id.clone(),
        course_name: st.course_name.clone(),
        started_at_unix: st.started_at_unix,
        duration_seconds,
        chunk_count: st.transcript_chunks.len(),
        retry_count: st.retry_count,
        last_error: st.last_error.clone(),
    })
}

#[tauri::command]
fn stop_audio_capture(state: State<'_, Arc<Mutex<CaptureState>>>) -> Result<CaptureResult, String> {
    let mut st = state.inner().lock().map_err(|_| "failed to lock capture state".to_string())?;
    if !st.running {
        return Err("audio capture is not running".to_string());
    }
    st.running = false;
    let duration_seconds = now_unix().saturating_sub(st.started_at_unix);
    let transcript = st.transcript_chunks.join(" ");
    Ok(CaptureResult {
        session_id: st.session_id.clone(),
        duration_seconds,
        transcript,
        chunk_count: st.transcript_chunks.len(),
    })
}

#[tauri::command]
fn trigger_transcription(state: State<'_, Arc<Mutex<CaptureState>>>) -> Result<TranscriptionResult, String> {
    let st = state.inner().lock().map_err(|_| "failed to lock capture state".to_string())?;
    if st.session_id.is_empty() {
        return Err("no audio capture session available".to_string());
    }
    let duration_seconds = if st.started_at_unix > 0 {
        now_unix().saturating_sub(st.started_at_unix)
    } else {
        0
    };
    let transcript = if st.transcript_chunks.is_empty() {
        "[desktop bridge] no chunks captured, fallback transcript generated.".to_string()
    } else {
        st.transcript_chunks.join(" ")
    };

    Ok(TranscriptionResult {
        session_id: st.session_id.clone(),
        course_name: st.course_name.clone(),
        duration_seconds,
        transcript,
        chunk_count: st.transcript_chunks.len(),
        source: "desktop-bridge".to_string(),
    })
}

#[tauri::command]
fn mark_capture_failed(error: String, state: State<'_, Arc<Mutex<CaptureState>>>) -> Result<CaptureStatus, String> {
    let mut st = state.inner().lock().map_err(|_| "failed to lock capture state".to_string())?;
    st.running = false;
    st.failed = true;
    st.retry_count = st.retry_count.saturating_add(1);
    st.last_error = Some(error);
    Ok(CaptureStatus {
        running: st.running,
        failed: st.failed,
        session_id: st.session_id.clone(),
        course_name: st.course_name.clone(),
        started_at_unix: st.started_at_unix,
        duration_seconds: 0,
        chunk_count: st.transcript_chunks.len(),
        retry_count: st.retry_count,
        last_error: st.last_error.clone(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(CaptureState::default())))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            start_audio_capture,
            get_audio_capture_status,
            stop_audio_capture,
            trigger_transcription,
            mark_capture_failed
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
