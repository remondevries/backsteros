//! Colored status marks for native tray menu items.
//!
//! macOS menus cannot tint Unicode glyphs, so we draw small RGBA icons:
//! - online / start: filled circle (●) in green
//! - stop all: filled circle (●) in red
//! - starting: U+25D4 (◔) in in_progress yellow `#e9c141`
//! - stopped: hollow circle (○) in muted gray

use tauri::image::Image;

/// Same yellow as desktop `in_progress` (`task-status-color` DEFAULT_STATUS_HEX).
pub const COLOR_STARTING: [u8; 4] = [0xe9, 0xc1, 0x41, 0xff];
/// Online / healthy / Start all.
pub const COLOR_ONLINE: [u8; 4] = [0x34, 0xc7, 0x59, 0xff];
/// Stop all.
pub const COLOR_STOP: [u8; 4] = [0xff, 0x45, 0x3a, 0xff];
/// Stopped outline.
pub const COLOR_STOPPED: [u8; 4] = [0x8e, 0x8e, 0x93, 0xff];

const SIZE: u32 = 32;
const CENTER: f32 = (SIZE as f32 - 1.0) / 2.0;
const OUTER_R: f32 = 11.0;
const STROKE: f32 = 2.25;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusMark {
    Online,
    Starting,
    Stopped,
    /// Filled red circle for Stop all.
    Stop,
}

pub fn status_icon(mark: StatusMark) -> Image<'static> {
    let rgba = match mark {
        StatusMark::Online => draw_filled_circle(COLOR_ONLINE),
        StatusMark::Starting => draw_upper_right_quadrant(COLOR_STARTING),
        StatusMark::Stopped => draw_hollow_circle(COLOR_STOPPED),
        StatusMark::Stop => draw_filled_circle(COLOR_STOP),
    };
    Image::new_owned(rgba, SIZE, SIZE)
}

fn put(px: &mut [u8], x: u32, y: u32, rgba: [u8; 4]) {
    let i = ((y * SIZE + x) * 4) as usize;
    px[i..i + 4].copy_from_slice(&rgba);
}

fn dist2(x: u32, y: u32) -> f32 {
    let dx = x as f32 - CENTER;
    let dy = y as f32 - CENTER;
    dx * dx + dy * dy
}

fn draw_filled_circle(color: [u8; 4]) -> Vec<u8> {
    let mut px = vec![0u8; (SIZE * SIZE * 4) as usize];
    let r2 = OUTER_R * OUTER_R;
    for y in 0..SIZE {
        for x in 0..SIZE {
            if dist2(x, y) <= r2 {
                put(&mut px, x, y, color);
            }
        }
    }
    px
}

fn draw_hollow_circle(color: [u8; 4]) -> Vec<u8> {
    let mut px = vec![0u8; (SIZE * SIZE * 4) as usize];
    let outer2 = OUTER_R * OUTER_R;
    let inner = OUTER_R - STROKE;
    let inner2 = inner * inner;
    for y in 0..SIZE {
        for x in 0..SIZE {
            let d = dist2(x, y);
            if d <= outer2 && d >= inner2 {
                put(&mut px, x, y, color);
            }
        }
    }
    px
}

/// U+25D4 CIRCLE WITH UPPER RIGHT QUADRANT BLACK — ring + filled NE quadrant.
fn draw_upper_right_quadrant(color: [u8; 4]) -> Vec<u8> {
    let mut px = draw_hollow_circle(color);
    let inner = OUTER_R - STROKE;
    let fill_r = inner - 0.5;
    let fill_r2 = fill_r * fill_r;
    for y in 0..SIZE {
        for x in 0..SIZE {
            // Screen coords: upper-right ⇒ x >= center, y <= center.
            if (x as f32) < CENTER || (y as f32) > CENTER {
                continue;
            }
            if dist2(x, y) <= fill_r2 {
                put(&mut px, x, y, color);
            }
        }
    }
    px
}
