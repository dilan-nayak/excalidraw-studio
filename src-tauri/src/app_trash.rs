//! In-app trash: deleted drawings/folders are moved to `<appData>/trash/<id>/payload` with an
//! `info.json` next to them so they can be restored later. Works across drives (copy + delete
//! fallback when a plain rename fails).

use std::fs;
use std::path::{Path, PathBuf};

fn copy_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        if let Some(p) = to.parent() {
            fs::create_dir_all(p)?;
        }
        fs::copy(from, to).map(|_| ())
    }
}

fn move_path(from: &Path, to: &Path) -> Result<(), String> {
    if let Some(p) = to.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    copy_recursive(from, to).map_err(|e| e.to_string())?;
    if from.is_dir() {
        fs::remove_dir_all(from)
    } else {
        fs::remove_file(from)
    }
    .map_err(|e| e.to_string())
}

fn inside(child: &Path, parent: &Path) -> bool {
    child == parent || child.starts_with(parent)
}

/// Move `path` (must be inside `workspace_root`) into a new trash slot `<trash_dir>/<slot>/payload`.
#[tauri::command]
pub fn trash_put(path: String, workspace_root: String, trash_dir: String, slot: String) -> Result<(), String> {
    let target = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let root = fs::canonicalize(&workspace_root).map_err(|e| e.to_string())?;
    if !inside(&target, &root) || target == root {
        return Err("Path is outside the open workspace".into());
    }
    if slot.contains(['/', '\\']) || slot.contains("..") || slot.is_empty() {
        return Err("Invalid trash slot".into());
    }
    let dest = PathBuf::from(&trash_dir).join(&slot).join("payload");
    move_path(&target, &dest)
}

/// Move the payload of trash slot `slot` back to `dest` (inside `workspace_root`). If `dest`
/// exists, a numeric suffix is added. Returns the final path.
#[tauri::command]
pub fn trash_restore(trash_dir: String, slot: String, dest: String, workspace_root: String) -> Result<String, String> {
    if slot.contains(['/', '\\']) || slot.contains("..") || slot.is_empty() {
        return Err("Invalid trash slot".into());
    }
    let payload = PathBuf::from(&trash_dir).join(&slot).join("payload");
    if !payload.exists() {
        return Err("Trash item no longer exists".into());
    }
    let root = fs::canonicalize(&workspace_root).map_err(|e| e.to_string())?;
    let dest = PathBuf::from(dest);
    let parent = dest.parent().ok_or("Bad destination")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let parent_c = fs::canonicalize(parent).map_err(|e| e.to_string())?;
    if !inside(&parent_c, &root) {
        return Err("Destination is outside the open workspace".into());
    }
    let name = dest.file_name().ok_or("Bad destination")?.to_string_lossy().to_string();
    let (stem, ext) = match name.rfind('.') {
        Some(i) if !payload.is_dir() => (name[..i].to_string(), name[i..].to_string()),
        _ => (name.clone(), String::new()),
    };
    let mut final_path = parent_c.join(&name);
    let mut n = 2;
    while final_path.exists() {
        final_path = parent_c.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    move_path(&payload, &final_path)?;
    Ok(final_path.to_string_lossy().to_string())
}
