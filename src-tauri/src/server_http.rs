fn handle_http_connection(
    mut stream: TcpStream,
    engine: Arc<ProviderEngine>,
    server_state: Arc<LocalServerState>,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(240)));

    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    });

    let mut request_line = String::new();
    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
        return;
    }
    let parts: Vec<&str> = request_line.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    let method = parts[0].to_uppercase();
    let raw_path = parts[1];
    let path = raw_path.split('?').next().unwrap_or(raw_path);

    let mut content_length: usize = 0;
    loop {
        let mut hline = String::new();
        if reader.read_line(&mut hline).unwrap_or(0) == 0 {
            break;
        }
        let trimmed = hline.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                content_length = v.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }

    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        let _ = stream.write_all(resp.as_bytes());
        let _ = stream.flush();
        return;
    }

    let mut body_bytes = vec![0u8; content_length.min(16 * 1024 * 1024)];
    if content_length > 0 {
        let _ = reader.read_exact(&mut body_bytes);
    }

    let port = server_state.port.load(Ordering::Relaxed);

    if method == "GET" && (path == "/" || path == "/health" || path == "/v1/health" || path == "/global/health") {
        let models = build_openai_models_list();
        write_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "healthy": true,
                "version": "1.0.0",
                "status": "ok",
                "server": "ZeusDesigns Local OpenAI & Native OpenCode Server",
                "port": port,
                "base_url": format!("http://127.0.0.1:{}/v1", port),
                "models_count": models.len(),
                "requests_served": server_state.request_count.load(Ordering::Relaxed),
                "opencode_ready": true
            }),
        );
        return;
    }

    // Native OpenCode SDK Server Protocol (`/event`, `/session`, `/session/{id}/message`, `/session/{id}/abort`)
    if method == "GET" && (path == "/event" || path == "/global/event" || path == "/api/event") {
        if write_sse_headers(&mut stream).is_err() {
            return;
        }
        let _ = write_sse_data(&mut stream, &json!({ "type": "server.connected", "properties": {} }));
        let (tx, rx) = std::sync::mpsc::channel::<Value>();
        if let Ok(mut subs) = server_state.oc_subscribers.lock() {
            subs.push(tx);
        }
        loop {
            match rx.recv_timeout(Duration::from_secs(15)) {
                Ok(ev) => {
                    if write_sse_data(&mut stream, &ev).is_err() {
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if stream.write_all(b": keepalive\n\n").is_err() || stream.flush().is_err() {
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        return;
    }

    if (path == "/session" || path == "/api/session") && method == "GET" {
        let list: Vec<Value> = server_state
            .oc_sessions
            .lock()
            .map(|m| {
                m.values()
                    .map(|s| {
                        json!({
                            "id": s.id,
                            "title": s.title,
                            "directory": s.directory,
                            "version": "1.0.0",
                            "time": { "created": s.created, "updated": now_secs() }
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        write_json_response(&mut stream, "200 OK", &json!(list));
        return;
    }

    if (path == "/session" || path == "/api/session") && method == "POST" {
        let req_json: Value = serde_json::from_slice(&body_bytes).unwrap_or_else(|_| json!({}));
        let sid = format!("ses_{}", random_hex(12));
        let title = req_json
            .get("title")
            .and_then(|t| t.as_str())
            .unwrap_or("New Session")
            .to_string();
        let dir_q = raw_path
            .split('?')
            .nth(1)
            .and_then(|q| {
                q.split('&').find_map(|kv| {
                    let (k, v) = kv.split_once('=')?;
                    if k == "directory" {
                        Some(percent_decode(v))
                    } else {
                        None
                    }
                })
            })
            .unwrap_or_default();
        let created = now_secs();
        let sess = OcSession {
            id: sid.clone(),
            title: title.clone(),
            directory: dir_q.clone(),
            messages: Vec::new(),
            created,
        };
        if let Ok(mut guard) = server_state.oc_sessions.lock() {
            guard.insert(sid.clone(), sess);
        }
        write_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "id": sid,
                "title": title,
                "directory": dir_q,
                "version": "1.0.0",
                "time": { "created": created, "updated": created }
            }),
        );
        return;
    }

    if path.starts_with("/session/") || path.starts_with("/api/session/") {
        let clean_p = path.trim_start_matches("/api");
        let segs: Vec<&str> = clean_p.split('/').filter(|s| !s.is_empty()).collect();
        if segs.len() >= 2 && segs[0] == "session" {
            let sid = segs[1].to_string();
            let action = segs.get(2).copied().unwrap_or("");
            if method == "GET" && action.is_empty() {
                let info = server_state
                    .oc_sessions
                    .lock()
                    .ok()
                    .and_then(|g| g.get(&sid).cloned());
                if let Some(s) = info {
                    write_json_response(
                        &mut stream,
                        "200 OK",
                        &json!({
                            "id": s.id,
                            "title": s.title,
                            "directory": s.directory,
                            "version": "1.0.0",
                            "time": { "created": s.created, "updated": now_secs() }
                        }),
                    );
                } else {
                    write_json_response(&mut stream, "404 Not Found", &json!({ "error": "Session not found" }));
                }
                return;
            }
            if method == "DELETE" && action.is_empty() {
                if let Ok(mut guard) = server_state.oc_sessions.lock() {
                    guard.remove(&sid);
                }
                write_json_response(&mut stream, "200 OK", &json!(true));
                return;
            }
            if method == "POST" && (action == "abort" || action == "interrupt") {
                if let Ok(guard) = server_state.oc_cancels.lock() {
                    if let Some(flag) = guard.get(&sid) {
                        flag.store(true, Ordering::Relaxed);
                    }
                }
                server_state.broadcast_oc_event(json!({
                    "type": "session.idle",
                    "properties": { "sessionID": sid }
                }));
                write_json_response(&mut stream, "200 OK", &json!(true));
                return;
            }
            if method == "POST" && (action == "message" || action == "prompt" || action == "prompt_async") {
                handle_opencode_session_message(
                    &mut stream,
                    raw_path,
                    &sid,
                    &body_bytes,
                    engine,
                    server_state,
                );
                return;
            }
        }
    }

    if method == "GET" && (path == "/v1/models" || path == "/models") {
        let models = build_openai_models_list();
        write_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "object": "list",
                "data": models
            }),
        );
        return;
    }

    if method == "GET" && (path == "/v1/opencode.json" || path == "/opencode.json") {
        let cfg = generate_opencode_config_json(port);
        write_json_response(&mut stream, "200 OK", &cfg);
        return;
    }

    if method == "POST"
        && (path == "/v1/chat/completions"
            || path == "/chat/completions"
            || path == "/v1/responses"
            || path == "/responses"
            || path == "/v1/messages"
            || path == "/messages")
    {
        server_state.request_count.fetch_add(1, Ordering::Relaxed);
        let req_json: Value = match serde_json::from_slice(&body_bytes) {
            Ok(v) => v,
            Err(e) => {
                write_json_response(
                    &mut stream,
                    "400 Bad Request",
                    &json!({ "error": { "message": format!("Invalid JSON body: {}", e), "type": "invalid_request_error" } }),
                );
                return;
            }
        };

        let is_anthropic_path = path.ends_with("/messages");
        let is_responses_path = path.ends_with("/responses");

        let requested_model = req_json
            .get("model")
            .and_then(|m| m.as_str())
            .unwrap_or("gemini-4-hydrogen")
            .to_string();
        let (provider_id, upstream_model) = resolve_provider_and_model(&requested_model);

        if let Ok(mut guard) = server_state.last_model.lock() {
            *guard = format!("{}/{}", provider_id, upstream_model);
        }

        let want_stream = req_json
            .get("stream")
            .and_then(|s| s.as_bool())
            .unwrap_or(false);

        let raw_msgs = if let Some(arr) = req_json.get("messages").and_then(|m| m.as_array()) {
            arr.clone()
        } else if let Some(inp) = req_json.get("input") {
            if let Some(arr) = inp.as_array() {
                arr.clone()
            } else if let Some(s) = inp.as_str() {
                vec![json!({ "role": "user", "content": s })]
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        let (mut system_prompt, chat_messages) = parse_openai_messages(&raw_msgs);

        // Merge top-level `system` or `instructions` field (used by Anthropic `/v1/messages` and OpenAI `/v1/responses`)
        if let Some(top_sys) = req_json.get("system").or_else(|| req_json.get("instructions")) {
            let sys_extra = if let Some(s) = top_sys.as_str() {
                s.to_string()
            } else if let Some(arr) = top_sys.as_array() {
                arr.iter()
                    .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                String::new()
            };
            if !sys_extra.trim().is_empty() {
                if system_prompt.is_empty() {
                    system_prompt = sys_extra;
                } else {
                    system_prompt = format!("{}\n\n{}", sys_extra, system_prompt);
                }
            }
        }

        // Universal OpenCode / OpenAI / Anthropic tool-calling injection
        let tools_arr = req_json
            .get("tools")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();
        let mut known_tool_names = HashSet::new();
        for t in &tools_arr {
            let func = t.get("function").unwrap_or(t);
            if let Some(n) = func.get("name").and_then(|x| x.as_str()) {
                known_tool_names.insert(n.to_string());
            }
        }
        let mut chat_messages = chat_messages;
        if !tools_arr.is_empty() {
            let tool_block =
                build_opencode_tools_system_block(&tools_arr, req_json.get("tool_choice"));
            // Place tool protocol at the top of system_prompt so provider character caps never truncate tool schemas
            if system_prompt.is_empty() {
                system_prompt = tool_block.trim().to_string();
            } else {
                system_prompt = format!("{}\n\n{}", tool_block.trim(), system_prompt);
            }
            // Reinforce `<tool_call>` syntax after `<tool_response>` on multi-turn OpenCode tool loops
            if let Some(last_msg) = chat_messages.last_mut() {
                if last_msg.role == "user" && last_msg.content.contains("<tool_response") {
                    last_msg.content.push_str(
                        "\n\n[OpenCode Tool-Call Protocol: Review the <tool_response> above. If another tool action is required, output ONLY <tool_call>{\"name\": \"tool_name\", \"arguments\": {...}}</tool_call>. If no more tools are needed, answer the user directly without <tool_call> tags.]",
                    );
                }
            }
        }

        let effort = req_json
            .get("reasoning_effort")
            .and_then(|e| e.as_str())
            .unwrap_or("medium")
            .to_string();

        let chat_req = ChatRequest {
            request_id: format!("srv-{}", uuid_v4()),
            provider: provider_id.clone(),
            model: upstream_model.clone(),
            effort,
            system: system_prompt,
            messages: chat_messages,
            workspace_root: None,
            custom: None,
        };

        let cancel = AtomicBool::new(false);
        let created = now_secs();
        let completion_id = format!("chatcmpl-{}", random_hex(12));

        // When tools are present or non-streaming is requested, collect the full output so `<tool_call>` blocks
        // can be deterministically compiled into OpenAI `tool_calls` or Anthropic `tool_use` blocks.
        if !want_stream || !tools_arr.is_empty() {
            let mut full_raw = String::new();
            let res = dispatch_stream(&engine, &chat_req, &cancel, |delta| {
                full_raw.push_str(delta);
            });

            if let Err(err) = res {
                write_json_response(
                    &mut stream,
                    "502 Bad Gateway",
                    &json!({ "error": { "message": err, "type": "upstream_error" } }),
                );
                return;
            }

            let (reasoning, answer_raw) = split_thinking_and_content(&full_raw);
            let (clean_text, tool_calls) =
                extract_tool_calls_from_text(&answer_raw, &known_tool_names);

            let prompt_tokens = 128u64;
            let completion_tokens = ((full_raw.len() / 4) as u64).max(1);

            if is_anthropic_path {
                handle_anthropic_response(
                    &mut stream,
                    want_stream,
                    &requested_model,
                    &reasoning,
                    &clean_text,
                    &tool_calls,
                    prompt_tokens,
                    completion_tokens,
                );
                return;
            }

            if is_responses_path {
                handle_openai_responses_api(
                    &mut stream,
                    want_stream,
                    &requested_model,
                    &clean_text,
                    &tool_calls,
                    prompt_tokens,
                    completion_tokens,
                );
                return;
            }

            if want_stream {
                if write_sse_headers(&mut stream).is_err() {
                    return;
                }
                // Role start chunk
                let _ = write_sse_data(
                    &mut stream,
                    &json!({
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": requested_model,
                        "choices": [{
                            "index": 0,
                            "delta": { "role": "assistant", "content": "" },
                            "finish_reason": Value::Null
                        }]
                    }),
                );
                if !reasoning.is_empty() {
                    let _ = write_sse_data(
                        &mut stream,
                        &json!({
                            "id": completion_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": requested_model,
                            "choices": [{
                                "index": 0,
                                "delta": { "reasoning_content": reasoning },
                                "finish_reason": Value::Null
                            }]
                        }),
                    );
                }
                if !clean_text.is_empty() {
                    let _ = write_sse_data(
                        &mut stream,
                        &json!({
                            "id": completion_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": requested_model,
                            "choices": [{
                                "index": 0,
                                "delta": { "content": clean_text },
                                "finish_reason": Value::Null
                            }]
                        }),
                    );
                }
                if !tool_calls.is_empty() {
                    let tc_deltas: Vec<Value> = tool_calls
                        .iter()
                        .enumerate()
                        .map(|(idx, tc)| {
                            json!({
                                "index": idx,
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": tc.arguments
                                }
                            })
                        })
                        .collect();
                    let _ = write_sse_data(
                        &mut stream,
                        &json!({
                            "id": completion_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": requested_model,
                            "choices": [{
                                "index": 0,
                                "delta": { "tool_calls": tc_deltas },
                                "finish_reason": Value::Null
                            }]
                        }),
                    );
                }
                let finish_reason = if tool_calls.is_empty() {
                    "stop"
                } else {
                    "tool_calls"
                };
                let _ = write_sse_data(
                    &mut stream,
                    &json!({
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": requested_model,
                        "choices": [{
                            "index": 0,
                            "delta": {},
                            "finish_reason": finish_reason
                        }],
                        "usage": {
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": prompt_tokens + completion_tokens
                        }
                    }),
                );
                let _ = stream.write_all(b"data: [DONE]\n\n");
                let _ = stream.flush();
            } else {
                let mut msg_obj = json!({
                    "role": "assistant",
                    "content": if clean_text.is_empty() && !tool_calls.is_empty() {
                        Value::Null
                    } else {
                        Value::String(clean_text)
                    }
                });
                if !reasoning.is_empty() {
                    msg_obj["reasoning_content"] = Value::String(reasoning);
                }
                if !tool_calls.is_empty() {
                    let tcs: Vec<Value> = tool_calls
                        .iter()
                        .map(|tc| {
                            json!({
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": tc.arguments
                                }
                            })
                        })
                        .collect();
                    msg_obj["tool_calls"] = Value::Array(tcs);
                }
                let finish_reason = if tool_calls.is_empty() {
                    "stop"
                } else {
                    "tool_calls"
                };
                write_json_response(
                    &mut stream,
                    "200 OK",
                    &json!({
                        "id": completion_id,
                        "object": "chat.completion",
                        "created": created,
                        "model": requested_model,
                        "choices": [{
                            "index": 0,
                            "message": msg_obj,
                            "finish_reason": finish_reason
                        }],
                        "usage": {
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": prompt_tokens + completion_tokens
                        }
                    }),
                );
            }
            return;
        }

        // Pure low-latency token-by-token SSE streaming when `stream: true` and no tool schema was passed
        if write_sse_headers(&mut stream).is_err() {
            return;
        }
        let _ = write_sse_data(
            &mut stream,
            &json!({
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": requested_model,
                "choices": [{
                    "index": 0,
                    "delta": { "role": "assistant", "content": "" },
                    "finish_reason": Value::Null
                }]
            }),
        );

        let mut total_chars = 0usize;
        let mut in_think = false;
        let _ = dispatch_stream(&engine, &chat_req, &cancel, |delta| {
            total_chars += delta.len();
            let mut s = delta;
            while !s.is_empty() {
                if !in_think {
                    if let Some(pos) = s.find("<think>") {
                        let before = &s[..pos];
                        if !before.is_empty() {
                            let _ = write_sse_data(
                                &mut stream,
                                &json!({
                                    "id": completion_id,
                                    "object": "chat.completion.chunk",
                                    "created": created,
                                    "model": requested_model,
                                    "choices": [{
                                        "index": 0,
                                        "delta": { "content": before },
                                        "finish_reason": Value::Null
                                    }]
                                }),
                            );
                        }
                        in_think = true;
                        s = &s[pos + 7..];
                    } else {
                        let _ = write_sse_data(
                            &mut stream,
                            &json!({
                                "id": completion_id,
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": requested_model,
                                "choices": [{
                                    "index": 0,
                                    "delta": { "content": s },
                                    "finish_reason": Value::Null
                                }]
                            }),
                        );
                        break;
                    }
                } else if let Some(pos) = s.find("</think>") {
                    let thought = &s[..pos];
                    if !thought.is_empty() {
                        let _ = write_sse_data(
                            &mut stream,
                            &json!({
                                "id": completion_id,
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": requested_model,
                                "choices": [{
                                    "index": 0,
                                    "delta": { "reasoning_content": thought },
                                    "finish_reason": Value::Null
                                }]
                            }),
                        );
                    }
                    in_think = false;
                    s = &s[pos + 8..];
                } else {
                    let _ = write_sse_data(
                        &mut stream,
                        &json!({
                            "id": completion_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": requested_model,
                            "choices": [{
                                "index": 0,
                                "delta": { "reasoning_content": s },
                                "finish_reason": Value::Null
                            }]
                        }),
                    );
                    break;
                }
            }
        });

        let comp_toks = ((total_chars / 4) as u64).max(1);
        let _ = write_sse_data(
            &mut stream,
            &json!({
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": requested_model,
                "choices": [{
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 128,
                    "completion_tokens": comp_toks,
                    "total_tokens": 128 + comp_toks
                }
            }),
        );
        let _ = stream.write_all(b"data: [DONE]\n\n");
        let _ = stream.flush();
        return;
    }

    write_json_response(
        &mut stream,
        "404 Not Found",
        &json!({
            "error": {
                "message": format!("Unknown endpoint '{}'. Supported: GET /v1/models, POST /v1/chat/completions, POST /v1/responses, POST /v1/messages", path),
                "type": "not_found_error"
            }
        }),
    );
}

fn handle_anthropic_response(
    stream: &mut TcpStream,
    want_stream: bool,
    model: &str,
    reasoning: &str,
    clean_text: &str,
    tool_calls: &[ParsedToolCall],
    input_tokens: u64,
    output_tokens: u64,
) {
    let msg_id = format!("msg_{}", random_hex(12));
    let stop_reason = if tool_calls.is_empty() {
        "end_turn"
    } else {
        "tool_use"
    };

    if !want_stream {
        let mut content = Vec::new();
        if !reasoning.is_empty() {
            content.push(json!({ "type": "thinking", "thinking": reasoning }));
        }
        if !clean_text.is_empty() || tool_calls.is_empty() {
            content.push(json!({ "type": "text", "text": clean_text }));
        }
        for tc in tool_calls {
            let input_val: Value =
                serde_json::from_str(&tc.arguments).unwrap_or_else(|_| json!({}));
            content.push(json!({
                "type": "tool_use",
                "id": tc.id,
                "name": tc.name,
                "input": input_val
            }));
        }
        write_json_response(
            stream,
            "200 OK",
            &json!({
                "id": msg_id,
                "type": "message",
                "role": "assistant",
                "model": model,
                "content": content,
                "stop_reason": stop_reason,
                "stop_sequence": Value::Null,
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens
                }
            }),
        );
        return;
    }

    if write_sse_headers(stream).is_err() {
        return;
    }
    let _ = write_sse_event(
        stream,
        "message_start",
        &json!({
            "type": "message_start",
            "message": {
                "id": msg_id,
                "type": "message",
                "role": "assistant",
                "model": model,
                "content": [],
                "stop_reason": Value::Null,
                "stop_sequence": Value::Null,
                "usage": { "input_tokens": input_tokens, "output_tokens": 1 }
            }
        }),
    );

    let mut block_idx = 0usize;
    if !clean_text.is_empty() || tool_calls.is_empty() {
        let _ = write_sse_event(
            stream,
            "content_block_start",
            &json!({
                "type": "content_block_start",
                "index": block_idx,
                "content_block": { "type": "text", "text": "" }
            }),
        );
        let _ = write_sse_event(
            stream,
            "content_block_delta",
            &json!({
                "type": "content_block_delta",
                "index": block_idx,
                "delta": { "type": "text_delta", "text": clean_text }
            }),
        );
        let _ = write_sse_event(
            stream,
            "content_block_stop",
            &json!({ "type": "content_block_stop", "index": block_idx }),
        );
        block_idx += 1;
    }

    for tc in tool_calls {
        let _ = write_sse_event(
            stream,
            "content_block_start",
            &json!({
                "type": "content_block_start",
                "index": block_idx,
                "content_block": {
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.name,
                    "input": {}
                }
            }),
        );
        let _ = write_sse_event(
            stream,
            "content_block_delta",
            &json!({
                "type": "content_block_delta",
                "index": block_idx,
                "delta": {
                    "type": "input_json_delta",
                    "partial_json": tc.arguments
                }
            }),
        );
        let _ = write_sse_event(
            stream,
            "content_block_stop",
            &json!({ "type": "content_block_stop", "index": block_idx }),
        );
        block_idx += 1;
    }

    let _ = write_sse_event(
        stream,
        "message_delta",
        &json!({
            "type": "message_delta",
            "delta": { "stop_reason": stop_reason, "stop_sequence": Value::Null },
            "usage": { "output_tokens": output_tokens }
        }),
    );
    let _ = write_sse_event(stream, "message_stop", &json!({ "type": "message_stop" }));
}
