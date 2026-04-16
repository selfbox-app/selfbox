use keyring::Entry;

const SERVICE: &str = "com.selfbox.desktop-sync";

/// Keys for the three secrets we store in the OS keychain.
const ACCESS_TOKEN: &str = "access_token";
const REFRESH_TOKEN: &str = "refresh_token";

fn entry(key: &str) -> keyring::Result<Entry> {
    Entry::new(SERVICE, key)
}

pub fn save_tokens(access: &str, refresh: &str) -> Result<(), String> {
    entry(ACCESS_TOKEN)
        .and_then(|e| e.set_password(access))
        .map_err(|e| e.to_string())?;
    entry(REFRESH_TOKEN)
        .and_then(|e| e.set_password(refresh))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_tokens() -> Option<(String, String)> {
    let access = entry(ACCESS_TOKEN).and_then(|e| e.get_password()).ok()?;
    let refresh = entry(REFRESH_TOKEN).and_then(|e| e.get_password()).ok()?;
    Some((access, refresh))
}

pub fn clear_tokens() -> Result<(), String> {
    for key in [ACCESS_TOKEN, REFRESH_TOKEN] {
        if let Ok(e) = entry(key) {
            // Ignore "not found" errors
            let _ = e.delete_credential();
        }
    }
    Ok(())
}
