#pragma once
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*zeus_stream_event_cb)(const char* event_json, void* user_data);

const char* zeus_engine_version(void);

// Cryptographic & protocol helpers ported from NEB backend_python
void zeus_generate_deepai_tryit_key(const char* user_agent, char* out_buf, size_t out_len);
void zeus_clean_chatjimmy_output(const char* raw_text, char* out_buf, size_t out_len);
void zeus_split_k2_details(const char* raw_content, char* out_answer, size_t out_len);

// Core streaming & micro-task C ABI (see docs/BACKEND_CONTRACT.md)
int zeus_chat_stream(const char* req_json, zeus_stream_event_cb cb, void* user_data);
int zeus_chat_cancel(const char* request_id);
int zeus_title_generate(const char* user_text, char* out_buf, size_t out_len);

#ifdef __cplusplus
}
#endif
