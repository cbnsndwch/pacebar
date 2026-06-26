//! Windows / non-macOS popover behavior.
//!
//! Uses a regular Tauri `WebviewWindow` configured as a borderless,
//! transparent, always-on-top, taskbar-skipped popover. Hides on focus loss.
//!
//! Public API mirrors `panel.rs` so the rest of the app stays platform-agnostic.

use std::sync::OnceLock;

use tauri::{AppHandle, Manager, PhysicalPosition, Position, Size, WebviewWindow, WindowEvent};

const PANEL_GAP_PX: f64 = 6.0;
const EDGE_MARGIN_PX: f64 = 8.0;

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

pub fn is_visible(app: &AppHandle) -> bool {
    main_window(app)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

pub fn hide_panel(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    if let Err(e) = window.hide() {
        log::warn!("hide_panel: {}", e);
    }
}

pub fn show_panel(app: &AppHandle) {
    if init(app).is_err() {
        return;
    }
    let Some(window) = main_window(app) else {
        return;
    };
    position_panel_from_tray(app);
    if let Err(e) = window.show() {
        log::warn!("show_panel: show failed: {}", e);
        return;
    }
    if let Err(e) = window.set_focus() {
        log::warn!("show_panel: set_focus failed: {}", e);
    }
}

pub fn toggle_panel(app: &AppHandle) {
    if init(app).is_err() {
        return;
    }
    if is_visible(app) {
        log::debug!("toggle_panel: hiding panel");
        hide_panel(app);
    } else {
        log::debug!("toggle_panel: showing panel");
        show_panel(app);
    }
}

fn position_panel_from_tray(app: &AppHandle) {
    let Some(tray) = app.tray_by_id("tray") else {
        log::debug!("position_panel_from_tray: tray icon not found");
        return;
    };
    match tray.rect() {
        Ok(Some(rect)) => position_panel_at_tray_icon(app, rect.position, rect.size),
        Ok(None) => log::debug!("position_panel_from_tray: tray rect not available yet"),
        Err(e) => log::warn!("position_panel_from_tray: failed to get tray rect: {}", e),
    }
}

pub fn init(app_handle: &AppHandle) -> tauri::Result<()> {
    static INIT: OnceLock<()> = OnceLock::new();
    if INIT.get().is_some() {
        return Ok(());
    }

    let Some(window) = main_window(app_handle) else {
        log::warn!("panel init: main window not found");
        return Ok(());
    };

    // Popover behavior: hide on focus loss, intercept window-close so that
    // Alt+F4 / system close requests hide the panel instead of quitting the
    // app (the tray icon is the canonical entry point), and re-anchor on
    // resize so that content growth doesn't push the panel off-screen on the
    // side of the screen the tray sits on (typically the bottom on Windows).
    let handle = app_handle.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(false) => {
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.hide();
            }
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.hide();
            }
        }
        WindowEvent::Resized(_) => {
            position_panel_from_tray(&handle);
        }
        _ => {}
    });

    let _ = INIT.set(());
    Ok(())
}

/// Position the popover beneath (or above, if tray is in lower half) the tray icon.
pub fn position_panel_at_tray_icon(
    app_handle: &AppHandle,
    icon_position: Position,
    icon_size: Size,
) {
    let Some(window) = main_window(app_handle) else {
        return;
    };

    let win_scale = window.scale_factor().unwrap_or(1.0);

    // Tray rect → physical pixels.
    let (icon_phys_x, icon_phys_y) = match &icon_position {
        Position::Physical(pos) => (pos.x as f64, pos.y as f64),
        Position::Logical(pos) => (pos.x * win_scale, pos.y * win_scale),
    };
    let (icon_phys_w, icon_phys_h) = match &icon_size {
        Size::Physical(s) => (s.width as f64, s.height as f64),
        Size::Logical(s) => (s.width * win_scale, s.height * win_scale),
    };

    let icon_center_x = icon_phys_x + (icon_phys_w / 2.0);
    let icon_center_y = icon_phys_y + (icon_phys_h / 2.0);

    // Find the monitor containing the tray icon, fall back to primary.
    let monitors = window.available_monitors().unwrap_or_default();
    let monitor = monitors
        .iter()
        .find(|m| {
            let pos = m.position();
            let size = m.size();
            let x0 = pos.x as f64;
            let y0 = pos.y as f64;
            let x1 = x0 + size.width as f64;
            let y1 = y0 + size.height as f64;
            icon_center_x >= x0 && icon_center_x < x1 && icon_center_y >= y0 && icon_center_y < y1
        })
        .cloned()
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        log::warn!("position_panel_at_tray_icon: no monitor for tray center");
        return;
    };

    let mon_phys_x = monitor.position().x as f64;
    let mon_phys_y = monitor.position().y as f64;
    let mon_phys_w = monitor.size().width as f64;
    let mon_phys_h = monitor.size().height as f64;
    let target_scale = monitor.scale_factor();

    // Configured logical size from tauri.conf.json (compile-time embedded).
    let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .expect("tauri.conf.json must be valid JSON");
    let conf_logical_w = conf["app"]["windows"][0]["width"].as_f64().unwrap_or(400.0);
    let conf_logical_h = conf["app"]["windows"][0]["height"]
        .as_f64()
        .unwrap_or(500.0);

    let outer = window.outer_size().ok();
    let panel_phys_w = outer
        .map(|s| s.width as f64)
        .filter(|w| *w > 1.0)
        .unwrap_or(conf_logical_w * target_scale);
    let panel_phys_h = outer
        .map(|s| s.height as f64)
        .filter(|h| *h > 1.0)
        .unwrap_or(conf_logical_h * target_scale);

    // Center horizontally over tray icon, clamp to monitor with margin.
    let margin = EDGE_MARGIN_PX * target_scale;
    let mut panel_x = icon_center_x - (panel_phys_w / 2.0);
    panel_x = panel_x.max(mon_phys_x + margin);
    panel_x = panel_x.min(mon_phys_x + mon_phys_w - panel_phys_w - margin);

    // Place above tray if tray sits in the lower half of its monitor (common
    // Windows taskbar position), otherwise below.
    let icon_center_rel_y = icon_center_y - mon_phys_y;
    let gap = PANEL_GAP_PX * target_scale;
    let panel_y = if icon_center_rel_y > mon_phys_h / 2.0 {
        icon_phys_y - panel_phys_h - gap
    } else {
        icon_phys_y + icon_phys_h + gap
    };

    let target = Position::Physical(PhysicalPosition::new(
        panel_x.round() as i32,
        panel_y.round() as i32,
    ));
    if let Err(e) = window.set_position(target) {
        log::warn!("set_position failed: {}", e);
    }
}
