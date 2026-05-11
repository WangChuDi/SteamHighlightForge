use std::path::Path;

fn main() {
    tauri_build::build();

    let out_dir = std::env::var("OUT_DIR").unwrap_or_default();
    if let Some(target_dir) = Path::new(&out_dir).ancestors().nth(3) {
        let lib_dir = Path::new("lib");
        if lib_dir.exists() {
            for entry in std::fs::read_dir(lib_dir).into_iter().flatten().flatten() {
                let src = entry.path();
                if src.is_file() {
                    let dest = target_dir.join(entry.file_name());
                    let _ = std::fs::copy(&src, &dest);
                }
            }
        }
    }
}
