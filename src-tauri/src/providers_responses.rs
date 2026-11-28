/// Stream from an OpenAI Responses API endpoint (`POST {base}/responses` or `{base}/v1/responses`).
pub fn stream_openai_responses_endpoint<F>(
    custom: &CustomEndpoint,
    model: &str,
    system: &str,
    messages: &[ChatMessage],
    effort: &str,
    cancel: &AtomicBool,
    on_delta: &mut F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    let client = build_client(240)?;
    let base = custom.base_url.trim_end_matches('/');
    let endpoint = if base.ends_with("/v1") {
        format!("{}/responses", base)
    } else {
        format!("{}/v1/responses", base)
    };
    let wants_tools = is_agent_tool_request(system);

    let mut input_items = Vec::new();
    for m in messages {
        let imgs: Vec<&AttachmentPayload> = m
            .attachments
            .iter()
            .filter(|a| a.mime.starts_with("image/") && !a.data_url.is_empty())
            .collect();
        if imgs.is_empty() {
            input_items.push(json!({ "role": m.role, "content": m.content }));
        } else {
            let mut parts = vec![json!({ "type": "input_text", "text": m.content })];
            for img in imgs {
                parts.push(json!({ "type": "input_image", "image_url": img.data_url }));
            }
            input_items.push(json!({ "role": m.role, "content": parts }));
        }
    }

    let mut payload = json!({
        "model": model,
        "stream": true,
        "input": input_items
    });
    if !system.trim().is_empty() {
        payload["instructions"] = json!(system);
    }
    if wants_tools {
        if let Some(arr) = build_native_oai_agent_tools().as_array() {
            let resp_tools: Vec<Value> = arr
                .iter()
                .filter_map(|t| {
                    let f = t.get("function")?;
                    Some(json!({
                        "type": "function",
                        "name": f.get("name")?.clone(),
                        "description": f.get("description").cloned().unwrap_or_else(|| json!("")),
                        "parameters": f.get("parameters").cloned().unwrap_or_else(|| json!({"type":"object","properties":{}}))
                    }))
                })
                .collect();
            if !resp_tools.is_empty() {
                payload["tools"] = json!(resp_tools);
            }
        }
    }
    if effort != "medium" {
        payload["reasoning"] = json!({ "effort": if effort == "max" { "high" } else { effort } });
    }

    let resp = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream, application/json")
        .header("Authorization", format!("Bearer {}", custom.api_key))
        .json(&payload)
        .send()
        .map_err(|e| format!("Responses API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body: String = resp.text().unwrap_or_default().chars().take(320).collect();
        return Err(format!("Responses API HTTP {}: {}", status, err_body));
    }

    let mut reader = BufReader::new(resp);
    let mut line = String::new();
    let mut in_think = false;
    let mut streamed_tool_calls: Vec<(String, String, String)> = Vec::new();
    let mut item_to_tc_idx: HashMap<String, usize> = HashMap::new();

    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
        let trimmed = line.trim();
        let raw_opt = trimmed
            .strip_prefix("data:")
            .map(|s| s.trim())
            .or_else(|| if trimmed.starts_with('{') { Some(trimmed) } else { None });
        if let Some(raw) = raw_opt {
            if raw == "[DONE]" {
                break;
            }
            if let Ok(ev) = serde_json::from_str::<Value>(raw) {
                let ev_type = ev.get("type").and_then(|v| v.as_str()).unwrap_or("");
                match ev_type {
                    "response.reasoning_summary_text.delta" | "response.reasoning_text.delta" => {
                        if let Some(d) = ev.get("delta").and_then(|v| v.as_str()) {
                            if !d.is_empty() {
                                if !in_think {
                                    in_think = true;
                                    on_delta("<think>");
                                }
                                on_delta(d);
                            }
                        }
                    }
                    "response.output_text.delta" => {
                        if let Some(d) = ev.get("delta").and_then(|v| v.as_str()) {
                            if !d.is_empty() {
                                if in_think {
                                    in_think = false;
                                    on_delta("</think>");
                                }
                                on_delta(d);
                            }
                        }
                    }
                    "response.output_item.added" => {
                        if let Some(item) = ev.get("item") {
                            if item.get("type").and_then(|v| v.as_str()) == Some("function_call") {
                                let item_id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let call_id = item.get("call_id").and_then(|v| v.as_str()).unwrap_or(&item_id).to_string();
                                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let args = item.get("arguments").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let idx = streamed_tool_calls.len();
                                streamed_tool_calls.push((call_id, name, args));
                                if !item_id.is_empty() {
                                    item_to_tc_idx.insert(item_id, idx);
                                }
                            }
                        }
                    }
                    "response.function_call_arguments.delta" => {
                        let item_id = ev.get("item_id").and_then(|v| v.as_str()).unwrap_or("");
                        let delta = ev.get("delta").and_then(|v| v.as_str()).unwrap_or("");
                        if let Some(&idx) = item_to_tc_idx.get(item_id) {
                            streamed_tool_calls[idx].2.push_str(delta);
                        } else if let Some(last) = streamed_tool_calls.last_mut() {
                            last.2.push_str(delta);
                        }
                    }
                    "response.function_call_arguments.done" => {
                        let item_id = ev.get("item_id").and_then(|v| v.as_str()).unwrap_or("");
                        if let Some(args) = ev.get("arguments").and_then(|v| v.as_str()) {
                            if let Some(&idx) = item_to_tc_idx.get(item_id) {
                                if streamed_tool_calls[idx].2.is_empty() {
                                    streamed_tool_calls[idx].2 = args.to_string();
                                }
                            }
                        }
                    }
                    "response.failed" | "error" => {
                        let msg = ev
                            .get("response")
                            .and_then(|r| r.get("error"))
                            .and_then(|e| e.get("message"))
                            .or_else(|| ev.get("error").and_then(|e| e.get("message")))
                            .or_else(|| ev.get("message"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("Responses API stream error");
                        return Err(msg.to_string());
                    }
                    _ => {}
                }
            }
        }
        line.clear();
    }
    if in_think {
        on_delta("</think>");
    }
    flush_oai_tool_calls(&streamed_tool_calls, on_delta);
    Ok(())
}
