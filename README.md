# WA Flow Simulator — Figma Plugin

Test your WhatsApp flows from FigJam directly inside Figma.

## Files
```
wa-flow-simulator/
  manifest.json   — plugin config
  code.js         — canvas parser (runs in Figma sandbox)
  ui.html         — simulator + editor panel
```

## Install in Figma / FigJam

1. Open Figma Desktop (plugin development requires the desktop app)
2. Go to **Plugins → Development → Import plugin from manifest…**
3. Select the `manifest.json` file from this folder
4. The plugin appears under **Plugins → Development → WA Flow Simulator**

## How to use

### Auto-parsing your FigJam flow

The plugin reads your canvas when it opens. It looks for:
- **Rectangles, frames, stickies** with text → becomes flow nodes
- **Connector arrows** between shapes → defines branches
- **Spatial order** (top → bottom) → used as fallback when no connectors exist

### Node type prefixes

Label your shapes with these prefixes to set node type:

| Prefix | Type | Example |
|--------|------|---------|
| (none) | Plain message | `Hello {{name}}! Welcome to Summer Camp.` |
| `CTA:` | CTA buttons | `CTA: Ready to start?` then next lines as button labels |
| `MEDIA:IMAGE` | Image message | `MEDIA:IMAGE` then caption on next line |
| `MEDIA:AUDIO` | Audio message | `MEDIA:AUDIO` |
| `MEDIA:VIDEO` | Video message | `MEDIA:VIDEO` |
| `DELAY:2000` | Delay (ms) | `DELAY:3000` = 3 second pause |
| `TIMEOUT:30` | Timeout node | `TIMEOUT:60` = 60 second no-response window |

### CTA buttons
- Add button labels on separate lines below `CTA:` text, or pipe-separated: `Yes | No | Maybe`
- Plugin enforces max 3 buttons and warns if any label exceeds 20 characters

### No-response branches
- Label your connector arrow with `no response`, `timeout`, or `no submission`
- In the simulator, the ⏰ button triggers the no-response branch instantly
- Timeout nodes show a live countdown bar

### Simulator controls
- **↺ Restart** — reset to beginning
- **⏭ Skip delay** — skip the current delay/typing wait
- **⏰ No response** — trigger the no-response branch immediately
- Type in the input box to send a free-text message (advances flow)

### Flow Editor tab
- Edit any node's text, type, buttons, delay/timeout values
- Add nodes manually with **+ Add node**
- Click **▶ Run** to jump back to simulator

## WhatsApp constraints enforced
- Max 3 CTA buttons per message
- Button labels truncated + warned at 20 characters
- Typing indicator with realistic delay (proportional to message length)
- Timed delays via DELAY nodes
- No-response timeout countdown
- Media messages render as typed placeholders (image / audio / video)
