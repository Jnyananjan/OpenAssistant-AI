# OpenAssistant AI — Visual Design System & Design Tokens

**Document:** `docs/dashboard-audit/05-design-system.md`  
**Author:** Senior Product Designer & Design Systems Architect  
**Project:** OpenAssistant AI Developer Operations Cockpit  
**Date:** October 2026  
**Status:** Visual Direction & Design Tokens

---

## 1. Visual Philosophy: The Calm Developer Tool

OpenAssistant AI is an intelligent background agent that respects the user's attention. The visual aesthetic of its operations dashboard must reflect that same philosophy:

* **Minimalist & Calm:** Low ambient brightness, zero visual noise, no superfluous gradients or glassmorphism.
* **Information-Dense & Structured:** Clear typography hierarchy, high scannability, compact spacing, and precise tabular alignments (inspired by **Linear** and **Supabase Studio**).
* **Developer-Grade Precision:** Monospace accents for tokens, keys, timestamps, IDs, and status codes (inspired by **Vercel**).
* **Deterministic Color Semantics:** Color is never decorative. Every hue communicates functional state (emerald = active/healthy, amber = awaiting response/snoozed, rose = failed/paused, sky = active focus/primary action).

---

## 2. Color Palette & Exact Hex Tokens

The primary theme is a curated Dark Mode designed to prevent eye fatigue during prolonged development sessions.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CORE COLOR TOKENS                               │
├─────────────────┬───────────┬──────────────────────────────────────────┤
│ Token Name      │ Hex Code  │ Semantic Purpose                         │
├─────────────────┼───────────┼──────────────────────────────────────────┤
│ --bg-base       │ #0b0f19   │ Darkest backdrop canvas (Body background)│
│ --bg-surface    │ #111827   │ Cards, sidebar, modal background (Gray-900)│
│ --bg-elevated   │ #1f2937   │ Hover states, active items, inputs (Gray-800)│
│ --bg-subtle     │ #374151   │ Disabled buttons, skeleton placeholders   │
│ --border-subtle │ #1f2937   │ Outer perimeter card borders             │
│ --border-strong │ #374151   │ Form inputs, divider lines, table headers│
│ --border-focus  │ #0ea5e9   │ High-visibility focus ring (Sky-500)     │
│ --text-primary  │ #f9fafb   │ High-contrast headings and body text     │
│ --text-secondary│ #9ca3af   │ Subtitles, table headers, descriptions   │
│ --text-tertiary │ #6b7280   │ Inactive metadata, hints, timestamps     │
│ --accent-main   │ #0ea5e9   │ Primary action CTA, links, active tab    │
│ --accent-hover  │ #0284c7   │ Primary action hover state (Sky-600)     │
│ --status-success│ #10b981   │ Connected, sent, healthy (Emerald-500)   │
│ --status-warning│ #f59e0b   │ Awaiting ACK, lease held, retry backoff  │
│ --status-danger │ #ef4444   │ Paused, failed, authorization denied     │
│ --status-purple │ #a855f7   │ Preference memory category (Purple-500)  │
│ --status-blue   │ #3b82f6   │ Project memory category (Blue-500)       │
└─────────────────┴───────────┴──────────────────────────────────────────┘
```

### Contrast Compliance
* Contrast ratio of `--text-primary` (`#f9fafb`) on `--bg-base` (`#0b0f19`) is **16.8:1** (far exceeding WCAG AAA 7:1 standard).
* Contrast ratio of `--text-secondary` (`#9ca3af`) on `--bg-surface` (`#111827`) is **5.4:1** (exceeding WCAG AA 4.5:1 standard).

---

## 3. Typography Scale & Hierarchy

### Font Family
* **Interface Text:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` (System sans-serif ensures native rendering speed with zero external font latency).
* **Code / IDs / Tokens / Keys:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`.

### Type Hierarchy Scale
| Scale Level | Font Size | Line Height | Weight | Letter Spacing | Use Case |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Display / H1** | 20px (1.25rem) | 28px | 600 (Semibold) | -0.02em | Page title in header |
| **Section / H2** | 16px (1.00rem) | 24px | 600 (Semibold) | -0.01em | Card header, modal title |
| **Subhead / H3** | 14px (0.875rem)| 20px | 600 (Semibold) | 0.00em | Group labels, form section |
| **Body (Default)**| 13px (0.8125rem)| 18px | 400 (Regular) | 0.00em | Table cell text, body copy |
| **Small / Metadata**| 12px (0.75rem)| 16px | 400 / 500 | +0.01em | Timestamps, status pills |
| **Monospace / Code**| 12px (0.75rem)| 16px | 400 (Regular) | -0.01em | API keys, tokens, CLI logs |

---

## 4. Spacing Scale & Layout Grid

### Spacing System (4px Baseline)
* `space-1`: 4px — Micro gap, pill internal padding
* `space-2`: 8px — Button gap, icon margins
* `space-3`: 12px — Input internal padding, card item gap
* `space-4`: 16px — Standard container padding, form field gap
* `space-6`: 24px — Page margin, major section divider
* `space-8`: 32px — Top-level section separation

### Layout Grid Dimensions
* **Sidebar Width:** 240px fixed width on desktop. Collapsible to 0px off-canvas on mobile (`< 768px`).
* **Header Height:** 52px fixed height with 1px border-bottom.
* **Content Max Width:** 1280px centered in viewport with 24px gutters.
* **Border Radius:**
  * Small: `4px` (Pills, badges, code tags)
  * Default: `6px` (Buttons, form inputs, cards, dialogs)
  * Large: `8px` (Outer modal shells)

---

## 5. Component Styling Specifications

### 5.1 Buttons
* **Primary:** `height: 34px; padding: 0 14px; background: #0ea5e9; border: none; border-radius: 6px; font-weight: 500; font-size: 13px; color: #ffffff;`
* **Secondary:** `height: 34px; padding: 0 14px; background: #111827; border: 1px solid #374151; border-radius: 6px; font-weight: 500; font-size: 13px; color: #f9fafb;`
* **Danger:** `height: 34px; padding: 0 14px; background: #111827; border: 1px solid #ef444455; border-radius: 6px; font-weight: 500; font-size: 13px; color: #f87171;`
* **Focus Visible:** `outline: 2px solid #0ea5e9; outline-offset: 2px;`

### 5.2 Form Inputs & Selects
* **Text & Password Input:**
  * `height: 34px; background: #0b0f19; border: 1px solid #374151; border-radius: 6px; padding: 0 10px; color: #f9fafb; font-size: 13px;`
  * Focus state: `border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9;`
  * Placeholder: `color: #6b7280;`

### 5.3 Data Tables
* **Header Row:** `height: 32px; background: #111827; border-bottom: 1px solid #374151; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; font-weight: 600;`
* **Data Row:** `height: 44px; border-bottom: 1px solid #1f2937; font-size: 13px; color: #f9fafb;`
* **Row Hover:** `background: #1f293788; transition: background 100ms ease;`

### 5.4 Status Badges
* **Connected / Active:** `background: #10b98115; border: 1px solid #10b98133; color: #34d399; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;`
* **Warning / Awaiting:** `background: #f59e0b15; border: 1px solid #f59e0b33; color: #fbbf24;`
* **Failed / Paused:** `background: #ef444415; border: 1px solid #ef444433; color: #f87171;`

---

## 6. Motion & Micro-Interactions

* **Transition Timing:** `150ms ease-out` for hover states and button presses.
* **Dialog Animation:** Fade in `opacity 0 -> 1` and subtle scale `0.98 -> 1.0` over `150ms`.
* **Sidebar Toggle:** Slide transition `200ms ease-in-out` on mobile breakpoints.
* **Terminal Stream:** Auto-scroll behavior throttled to 60fps to prevent layout thrashing.
* **Reduced Motion:** Fully adheres to `@media (prefers-reduced-motion: reduce)` by disabling transforms and transitions.

---

## 7. Recommended Component Library & Stack

* **Core Recommendation:** **React + Vite** with **shadcn/ui** (based on **Radix UI** primitives and **Tailwind CSS v3/v4**).
  * *Why:* Radix UI delivers unstyled, accessible, robust primitives (Dialog, DropdownMenu, Combobox, Tabs, Toast) with complete keyboard and focus management.
  * *Icons:* **Lucide React** (`lucide-react`) provides consistent, clean 24x24 SVG stroke icons matching Linear and Supabase styles.
  * *Graph Rendering:* Built-in lightweight SVG or `@xyflow/react` (React Flow) for interactive graph exploration without heavy D3 overhead.
