# Zeus Codes

Zeus Codes is the [Open Design](https://github.com/nexu-io/open-design) application (Apache-2.0, v0.27.3) taken as-is, without its git history, with one change: eight keyless AI providers are built in.

The app, daemon, skills, design systems, templates, agent runtimes and code-to-video pipeline are upstream code. Only provider wiring is ours.

## Built-in providers

A loopback gateway starts with the daemon (`apps/daemon/src/zeus-providers`) and speaks the OpenAI API at `http://127.0.0.1:17873/<provider>/v1`. No key is needed. Set `OD_ZEUS_PORT` to move it.

| Provider | Id | Models |
| --- | --- | --- |
| Mercury 3 | `mercury3` | `mercury-3` |
| ChatJimmy | `chatjimmy` | `llama3.1-8B` |
| Qwen (app gateway) | `qwen` | served live by the gateway |
| K2 Horizon | `k2horizon` | `IFM/K2-Horizon-375B-A23B` |
| Motif | `motif` | `motif-102b`, `motif-12-7b-reasoning`, `motif-12-7b`, `motif-tiny` |
| DeepAI | `deepai` | `qwen3.8-flash`, `claude-haiku-5-5`, `gpt-6-luna`, `deepseek-v4.1-flash`, `gemma-4`, more |
| LongCat | `longcat` | `longcat/LongCat-2.5` |
| Gemini Web | `geminiweb` | `geminiweb/gemini-flash-lite` |

They appear in Settings under the OpenAI-compatible protocol as "(Zeus, free)" presets, so chat, the OpenCode agent runtime and design runs all use them like any other provider.

The providers are plain chat endpoints. The gateway emulates function calling: tool schemas are injected as a `<tool_call>` text protocol and parsed back into OpenAI `tool_calls`, so agent loops can drive them.

## Run

```
pnpm install
pnpm tools-dev
```

Requires Node 24 and pnpm 10. See `QUICKSTART.md` and `AGENTS.md` for the upstream workflow.

## License

Apache-2.0. Upstream copyright remains with the Open Design authors; see `LICENSE`.
