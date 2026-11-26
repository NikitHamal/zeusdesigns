use std::time::{SystemTime, UNIX_EPOCH};

/// Pure Rust SHA-256 implementation (FIPS 180-4) returning raw 32-byte digest.
pub fn sha256_bytes(input: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];

    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];

    let bit_len = (input.len() as u64) * 8;
    let mut msg = input.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0x00);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (i, word) in chunk.chunks_exact(4).enumerate() {
            w[i] = u32::from_be_bytes([word[0], word[1], word[2], word[3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut out = [0u8; 32];
    for (i, word) in h.iter().enumerate() {
        out[i * 4..(i + 1) * 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

/// Pure Rust SHA-256 hex digest (FIPS 180-4).
pub fn sha256_hex(input: &[u8]) -> String {
    let bytes = sha256_bytes(input);
    let mut out = String::with_capacity(64);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

/// Pure Rust HMAC-SHA256 returning 32-byte MAC (used for Qwen OSS4-HMAC-SHA256 signing).
pub fn hmac_sha256_bytes(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut k_block = [0u8; 64];
    if key.len() > 64 {
        let hashed = sha256_bytes(key);
        k_block[..32].copy_from_slice(&hashed);
    } else {
        k_block[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= k_block[i];
        opad[i] ^= k_block[i];
    }

    let mut inner_input = Vec::with_capacity(64 + message.len());
    inner_input.extend_from_slice(&ipad);
    inner_input.extend_from_slice(message);
    let inner_hash = sha256_bytes(&inner_input);

    let mut outer_input = Vec::with_capacity(64 + 32);
    outer_input.extend_from_slice(&opad);
    outer_input.extend_from_slice(&inner_hash);
    sha256_bytes(&outer_input)
}

/// Pure Rust HMAC-SHA256 returning lowercase hex string.
pub fn hmac_sha256_hex(key: &[u8], message: &[u8]) -> String {
    let mac = hmac_sha256_bytes(key, message);
    let mut out = String::with_capacity(64);
    for b in mac {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

/// Pure Rust RFC 1321 MD5 implementation with reversed hex output matching DeepAI's `generateIslandKey`.
pub fn md5_reversed_hex(input: &[u8]) -> String {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const K: [u32; 64] = [
        0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
        0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
        0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
        0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
        0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
        0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
        0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
        0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
    ];

    let mut a0: u32 = 0x67452301;
    let mut b0: u32 = 0xefcdab89;
    let mut c0: u32 = 0x98badcfe;
    let mut d0: u32 = 0x10325476;

    let bit_len = (input.len() as u64).wrapping_mul(8);
    let mut msg = input.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0x00);
    }
    msg.extend_from_slice(&bit_len.to_le_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut m = [0u32; 16];
        for (i, word) in chunk.chunks_exact(4).enumerate() {
            m[i] = u32::from_le_bytes([word[0], word[1], word[2], word[3]]);
        }

        let mut a = a0;
        let mut b = b0;
        let mut c = c0;
        let mut d = d0;

        for i in 0..64 {
            let (f, g) = match i {
                0..=15 => ((b & c) | ((!b) & d), i),
                16..=31 => ((d & b) | ((!d) & c), (5 * i + 1) % 16),
                32..=47 => (b ^ c ^ d, (3 * i + 5) % 16),
                _ => (c ^ (b | (!d)), (7 * i) % 16),
            };
            let temp = d;
            d = c;
            c = b;
            let sum = a.wrapping_add(f).wrapping_add(K[i]).wrapping_add(m[g]);
            b = b.wrapping_add(sum.rotate_left(S[i]));
            a = temp;
        }

        a0 = a0.wrapping_add(a);
        b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c);
        d0 = d0.wrapping_add(d);
    }

    let mut raw = [0u8; 16];
    raw[0..4].copy_from_slice(&a0.to_le_bytes());
    raw[4..8].copy_from_slice(&b0.to_le_bytes());
    raw[8..12].copy_from_slice(&c0.to_le_bytes());
    raw[12..16].copy_from_slice(&d0.to_le_bytes());

    let mut hex = String::with_capacity(32);
    for b in raw {
        hex.push_str(&format!("{:02x}", b));
    }
    hex.chars().rev().collect()
}

/// Standard RFC 1321 MD5 lowercase hex digest.
pub fn md5_hex(input: &[u8]) -> String {
    md5_reversed_hex(input).chars().rev().collect()
}

/// Generate MyChat Native Direct Cloud's rolling hourly `X-Encryption-Token` (`md5("GPT_KEYBOARD_IS_AWESOME|" + "YYYY-MM-DD HH")`).
pub fn generate_mychat_encryption_token(unix_secs: u64) -> String {
    let (full, date_part) = iso8601_utc_compact(unix_secs);
    let hour = full.get(9..11).unwrap_or("00");
    let yr = date_part.get(0..4).unwrap_or("2026");
    let mo = date_part.get(4..6).unwrap_or("01");
    let dy = date_part.get(6..8).unwrap_or("01");
    let raw = format!("GPT_KEYBOARD_IS_AWESOME|{}-{}-{} {}", yr, mo, dy, hour);
    md5_hex(raw.as_bytes())
}

/// Generate DeepAI's current `generateIslandKey` (`tryit-{rand}-{reversed_md5}`) for chat & attachment uploads.
pub fn generate_deepai_island_key(user_agent: &str) -> String {
    const SALT: &str = "hackers_become_a_little_stinkier_every_time_they_hack";
    let random_num = (pseudo_random_u64() % 100_000_000_000).to_string();
    let h1 = md5_reversed_hex(format!("{}{}{}", user_agent, random_num, SALT).as_bytes());
    let h2 = md5_reversed_hex(format!("{}{}", user_agent, h1).as_bytes());
    let h3 = md5_reversed_hex(format!("{}{}", user_agent, h2).as_bytes());
    format!("tryit-{}-{}", random_num, h3)
}

/// Decode standard or URL-safe Base64 into raw bytes.
pub fn decode_base64(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u8 = 0;

    for b in input.bytes() {
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            b' ' | b'\r' | b'\n' | b'\t' => continue,
            _ => return None,
        };
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xff) as u8);
        }
    }
    Some(out)
}

/// Parse a `data:<mime>;base64,<payload>` URL into `(mime_type, raw_bytes)`.
pub fn decode_data_url(data_url: &str) -> Option<(String, Vec<u8>)> {
    let trimmed = data_url.trim();
    if let Some(rest) = trimmed.strip_prefix("data:") {
        let (meta, b64_part) = rest.split_once(',')?;
        let mime = meta
            .split(';')
            .next()
            .filter(|s| !s.is_empty())
            .unwrap_or("application/octet-stream")
            .to_string();
        let bytes = decode_base64(b64_part)?;
        Some((mime, bytes))
    } else {
        let bytes = decode_base64(trimmed)?;
        Some(("application/octet-stream".to_string(), bytes))
    }
}

/// Convert UNIX epoch seconds into `("YYYYMMDDTHHMMSSZ", "YYYYMMDD")` for Alibaba Cloud OSS V4 signing.
pub fn iso8601_utc_compact(unix_secs: u64) -> (String, String) {
    let days = (unix_secs / 86400) as i64;
    let secs_of_day = unix_secs % 86400;
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    // Howard Hinnant civil_from_days algorithm
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    let date_part = format!("{:04}{:02}{:02}", year, m, d);
    let full = format!("{}T{:02}{:02}{:02}Z", date_part, hour, minute, second);
    (full, date_part)
}

static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

pub fn pseudo_random_u64() -> u64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9e3779b97f4a7c15);
    let seq = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let mut x = nanos ^ seq.wrapping_mul(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d049bb133111eb);
    x ^ (x >> 31)
}

pub fn random_hex(len: usize) -> String {
    let mut out = String::with_capacity(len);
    while out.len() < len {
        let s = format!("{:016x}", pseudo_random_u64());
        out.push_str(&s);
    }
    out.truncate(len);
    out
}

pub fn uuid_v4() -> String {
    let a = pseudo_random_u64();
    let b = pseudo_random_u64();
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (a >> 32) as u32,
        ((a >> 16) & 0xffff) as u16,
        (a & 0x0fff) as u16,
        (((b >> 48) & 0x3fff) | 0x8000) as u16,
        b & 0xffffffffffff
    )
}

pub fn fake_ipv4() -> String {
    let r = pseudo_random_u64();
    format!(
        "24.{}.{}.{}",
        (r & 0x07),
        ((r >> 8) % 254) + 1,
        ((r >> 16) % 253) + 1
    )
}

extern "C" {
    fn zeus_generate_deepai_tryit_key(
        user_agent: *const std::os::raw::c_char,
        out_buf: *mut std::os::raw::c_char,
        out_len: usize,
    );
    fn zeus_clean_chatjimmy_output(
        raw_text: *const std::os::raw::c_char,
        out_buf: *mut std::os::raw::c_char,
        out_len: usize,
    );
    fn zeus_split_k2_details(
        raw_content: *const std::os::raw::c_char,
        out_answer: *mut std::os::raw::c_char,
        out_len: usize,
    );
}

/// Calls the linked C++20 `zeus_engine` library to strip `<|stats|>` and `<|think|>` blocks
/// from ChatJimmy responses via zero-copy stack buffer FFI.
pub fn cpp_clean_chatjimmy_output(raw: &str) -> Option<String> {
    let c_in = std::ffi::CString::new(raw).ok()?;
    let mut buf = vec![0u8; raw.len() + 64];
    unsafe {
        zeus_clean_chatjimmy_output(
            c_in.as_ptr(),
            buf.as_mut_ptr() as *mut std::os::raw::c_char,
            buf.len(),
        );
        let c_str = std::ffi::CStr::from_ptr(buf.as_ptr() as *const std::os::raw::c_char);
        Some(c_str.to_string_lossy().to_string())
    }
}

/// Calls the linked C++20 `zeus_engine` library to split K2Horizon `<details>` reasoning blocks.
pub fn cpp_split_k2_details(raw: &str) -> Option<String> {
    let c_in = std::ffi::CString::new(raw).ok()?;
    let mut buf = vec![0u8; raw.len() + 64];
    unsafe {
        zeus_split_k2_details(
            c_in.as_ptr(),
            buf.as_mut_ptr() as *mut std::os::raw::c_char,
            buf.len(),
        );
        let c_str = std::ffi::CStr::from_ptr(buf.as_ptr() as *const std::os::raw::c_char);
        Some(c_str.to_string_lossy().to_string())
    }
}

pub fn generate_deepai_tryit_key(user_agent: &str) -> String {
    if let Ok(c_ua) = std::ffi::CString::new(user_agent) {
        let mut buf = [0u8; 160];
        unsafe {
            zeus_generate_deepai_tryit_key(
                c_ua.as_ptr(),
                buf.as_mut_ptr() as *mut std::os::raw::c_char,
                buf.len(),
            );
            if let Ok(s) = std::ffi::CStr::from_ptr(buf.as_ptr() as *const std::os::raw::c_char).to_str() {
                if s.starts_with("tryit-") && s.len() > 70 {
                    return s.to_string();
                }
            }
        }
    }
    const SALT: &str = "hackers_become_a_little_stinkier_every_time_they_hack";
    let random_num = (pseudo_random_u64() % 100_000_000_000).to_string();
    let h1 = sha256_hex(format!("{}{}{}", user_agent, random_num, SALT).as_bytes());
    let h2 = sha256_hex(format!("{}{}", user_agent, h1).as_bytes());
    let inner = sha256_hex(format!("{}{}", user_agent, h2).as_bytes());
    format!("tryit-{}-{}", random_num, inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn test_md5_reversed_and_island_key() {
        // MD5("abc") = "900150983cd24fb0d6963f7d28e17f72", reversed = "27f71e82d7f3696d0bf42dc389051009"
        assert_eq!(md5_reversed_hex(b"abc"), "27f71e82d7f3696d0bf42dc389051009");
        let k = generate_deepai_island_key("Mozilla/5.0");
        assert!(k.starts_with("tryit-"));
        assert!(k.len() > 40);
    }

    #[test]
    fn test_decode_data_url() {
        let (mime, bytes) = decode_data_url("data:image/png;base64,aGVsbG8=").unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(bytes, b"hello");
    }

    #[test]
    fn test_deepai_tryit_key_format() {
        let k = generate_deepai_tryit_key("Mozilla/5.0");
        assert!(k.starts_with("tryit-"));
        assert!(k.len() > 70);
    }

    #[test]
    fn test_cpp_ffi_chatjimmy_cleaner() {
        let cleaned = cpp_clean_chatjimmy_output("Material 3 Audio App<|stats|>{\"tps\":21000}<|/stats|>").unwrap();
        assert_eq!(cleaned, "Material 3 Audio App");
    }

    #[test]
    fn test_cpp_ffi_k2_details_splitter() {
        let ans = cpp_split_k2_details("<details>thinking</details>\nFinal UI Screen").unwrap();
        assert_eq!(ans, "Final UI Screen");
    }
}
