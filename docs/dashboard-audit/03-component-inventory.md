# OpenAssistant AI — Reusable UI Component Inventory

**Document:** `docs/dashboard-audit/03-component-inventory.md`  
**Author:** Senior Product Designer & Design Systems Engineer  
**Project:** OpenAssistant AI Dashboard Component Library  
**Date:** October 2026  
**Status:** Component Architecture & Specification

---

## Component Categorization Overview

To achieve a calm, developer-tool aesthetic with high accessibility and maintainability, the OpenAssistant AI dashboard components are structured into 8 functional families:

1. **Shell & Navigation** (`AppShell`, `Sidebar`, `TopBar`, `Breadcrumb`, `MobileDrawer`)
2. **Typography & Layout** (`PageHeader`, `SectionHeader`, `Card`, `Divider`, `Grid`)
3. **Controls & Actions** (`Button`, `IconButton`, `SegmentedControl`, `DropdownMenu`)
4. **Forms & Inputs** (`TextInput`, `PasswordKeyInput`, `Select`, `Combobox`, `ToggleSwitch`)
5. **Data Display & Status** (`StatusBadge`, `DataTable`, `EmptyState`, `MetricCard`, `TimelineStream`)
6. **Domain-Specific Cards** (`ProviderCard`, `ModelCard`, `MemoryNodeCard`, `TaskItemRow`)
7. **Visualizations & Diagnostics** (`MemoryGraphViewer`, `TerminalConsole`, `HealthMatrix`)
8. **Feedback & Overlays** (`ModalDialog`, `ConfirmDialog`, `ToastNotification`, `LoadingSkeleton`)

---

## 1. Shell & Navigation Components

### 1.1 `AppShell`
* **Purpose:** Top-level layout wrapper coordinating the persistent sidebar, header, main scroll area, and toast overlay.
* **Props:** `children: ReactNode`, `currentRoute: string`, `user: AppUser`, `systemHealth: 'healthy' | 'warning' | 'error'`.
* **States:** Desktop layout (sidebar docked 240px), Mobile layout (sidebar collapsed to hamburger drawer).
* **Accessibility:** Contains `<header>`, `<nav aria-label="Main Navigation">`, `<main id="main-content">`, and skip-to-content link.
* **Reuse:** Global wrapper across all dashboard routes.
* **Existing Code:** Rudimentary layout in [`src/setup/ui.ts`](file:///d:/Projects/Jana%20AI/src/setup/ui.ts#L200-L240).
* **Recommended Source:** Custom CSS Grid/Flexbox following Radix UI layout patterns.

### 1.2 `SidebarNav`
* **Purpose:** Persistent vertical navigation menu with grouped links, active indicators, and shortcut badges.
* **Props:** `items: NavGroup[]`, `activePath: string`, `onNavigate: (path: string) => void`.
* **States:** Item default, hover, active (subtle background fill + accent left border), focused.
* **Accessibility:** Full keyboard arrow key navigation (`aria-current="page"`).
* **Reuse:** Global.

### 1.3 `Breadcrumb`
* **Purpose:** Surfaces spatial orientation in subpages (e.g. `AI Providers / Custom OpenAI Endpoint`).
* **Props:** `crumbs: Array<{ label: string; href?: string }>`.
* **Accessibility:** `<nav aria-label="Breadcrumb">` with `<ol>` and `aria-hidden` chevron separators.
* **Reuse:** Top of every page header.

---

## 2. Controls & Actions

### 2.1 `Button`
* **Purpose:** Core interactive triggers for form submissions, dialog confirmations, and page actions.
* **Props:** `variant: 'primary' | 'secondary' | 'danger' | 'ghost'`, `size: 'sm' | 'md' | 'lg'`, `isLoading?: boolean`, `disabled?: boolean`, `icon?: LucideIcon`, `children: ReactNode`.
* **Variants & Styling:**
  * `primary`: Background `#0ea5e9` (accent sky blue), text white. Focus ring `#38bdf8`.
  * `secondary`: Background `#1e293b` (slate-800), border `#334155`, text `#f8fafc`. Hover `#334155`.
  * `danger`: Background `#ef444422`, border `#ef444455`, text `#f87171`. Hover `#ef444444`.
  * `ghost`: Transparent background, hover `#1e293b`, text `#94a3b8`.
* **States:** Default, Hover, Active, Focus-visible, Loading (spinner replaces icon), Disabled (`opacity-50`).
* **Accessibility:** Native `<button>`, explicit `aria-disabled`, visible focus ring with 2px offset.
* **Existing Code:** Custom `.btn` class in [`src/setup/ui.ts`](file:///d:/Projects/Jana%20AI/src/setup/ui.ts#L76-L89).

### 2.2 `IconButton`
* **Purpose:** Compact trigger for secondary toolbar actions (e.g. Refresh, Copy, Close, Info).
* **Props:** `icon: LucideIcon`, `label: string` (required for a11y), `onClick: () => void`, `tooltip?: string`.
* **Accessibility:** `aria-label` mandatory. Focus ring identical to `Button`.

---

## 3. Forms & Secure Inputs

### 3.1 `PasswordKeyInput` (High Security)
* **Purpose:** Secure credential entry for sensitive API tokens (OpenAI, Gemini, Supermemory, Telegram).
* **Props:** `value: string`, `onChange: (val: string) => void`, `placeholder: string`, `provider: ProviderId`, `showMaskToggle?: boolean`.
* **Features:**
  * Obscures characters by default (`type="password"`).
  * Eye icon toggle to reveal plaintext with keyboard shortcut.
  * Monospace font formatting for easy character identification.
  * Built-in client-side regex format validation (e.g. `sk-...`, `AIza...`).
  * Auto-complete disabled (`autocomplete="new-password"`, `spellcheck="false"`).
* **Reuse:** Provider Drawer, Setup Wizard, Settings page.
* **Existing Code:** Standard input in `renderConnectProviderHtml` in [`src/setup/ui.ts`](file:///d:/Projects/Jana%20AI/src/setup/ui.ts#L64-L75).

### 3.2 `MaskedKeyPill`
* **Purpose:** Safe rendering of stored credentials without revealing secret bytes.
* **Props:** `maskedKey: string` (e.g. `sk-...1234`), `provider: string`, `isBlurred?: boolean`.
* **Features:**
  * Uses Telegram-style spoiler blur effect (`filter: blur(4px)`) until clicked/hovered.
  * Monospace badge with lock icon.
* **Existing Code:** `EncryptionService.maskKey()` in [`src/security/encryption.ts`](file:///d:/Projects/Jana%20AI/src/security/encryption.ts#L45-L52).

### 3.3 `Combobox` (Searchable Select)
* **Purpose:** Selecting timezone from 400+ IANA names or selecting a model from the catalog.
* **Props:** `options: Array<{ value: string; label: string; subtext?: string }>`, `value: string`, `onChange: (val: string) => void`, `placeholder: string`.
* **Accessibility:** Follows WAI-ARIA Combobox design pattern with `aria-expanded`, `aria-autocomplete="list"`, and keyboard arrow navigation.

---

## 4. Domain-Specific Cards

### 4.1 `ProviderCard`
* **Purpose:** Display single AI provider connection status, active model, and quick actions.
* **Props:**
  ```ts
  interface ProviderCardProps {
    provider: ProviderId;
    displayName: string;
    description: string;
    iconUrl: string;
    status: 'connected' | 'disconnected' | 'invalid';
    maskedKey?: string;
    baseUrl?: string;
    lastTestedAt?: string;
    onConnect: () => void;
    onTest: () => Promise<boolean>;
    onDisconnect: () => void;
  }
  ```
* **States:** Disconnected (subtle outline, "Connect" CTA), Connected (green status dot, masked key, "Update" CTA), Error (red border, error tooltip).
* **Reuse:** AI Provider Hub (`/providers`) and System Overview (`/`).

### 4.2 `ModelCard` / `ModelRow`
* **Purpose:** Render items in the searchable model catalog with capabilities and token limits.
* **Props:** `model: ModelCatalogItem`, `isDefault: boolean`, `isSelectable: boolean`, `onSelect: () => void`.
* **Displayed Badges:** Context window (`1M tokens`), Cost tier (`Free`, `Low`, `Medium`), Capabilities pills (`Coding`, `Reasoning`, `Fast`).

---

## 5. Visualizations & Diagnostic Displays

### 5.1 `MemoryGraphViewer`
* **Purpose:** Interactive node-link graph visualizing connected personal facts, projects, goals, and preferences.
* **Props:**
  ```ts
  interface MemoryGraphViewerProps {
    nodes: MemoryGraphNode[];
    edges: MemoryGraphEdge[];
    selectedNodeId?: string;
    onSelectNode: (node: MemoryGraphNode) => void;
    filterCategory?: MemoryCategory;
  }
  ```
* **Implementation Technique:** Pure SVG or HTML5 Canvas with force-directed physics.
  * Node colors: `preference` (#a855f7 purple), `project` (#0ea5e9 blue), `goal` (#f59e0b amber), `relationship` (#f43f5e rose), `fact` (#10b981 emerald).
  * Edge styling: 1.5px dashed stroke (#475569) with directional marker arrow and text label (`relates_to`, `depends_on`).
* **Fallback:** Always accompanies an accessible table view for screen readers and keyboard-only users.
* **Existing Code:** Interactive SVG implementation in [`src/setup/ui.ts`](file:///d:/Projects/Jana%20AI/src/setup/ui.ts#L1300-L1530).

### 5.2 `TerminalConsole`
* **Purpose:** High-density monospace streaming console for deployment logs and worker diagnostics.
* **Props:** `lines: string[]`, `autoScroll?: boolean`, `onClear?: () => void`.
* **Features:**
  * Dark background (`#090d16`), monospace font (`ui-monospace, Menlo, Monaco, Consolas`).
  * Automatic regex-based secret redaction on all incoming output.
  * Auto-scroll lock with pause toggle when user scrolls up.
* **Existing Code:** Terminal component in [`src/setup/ui.ts`](file:///d:/Projects/Jana%20AI/src/setup/ui.ts#L700-L750).

---

## 6. Feedback & Overlays

### 6.1 `ConfirmDialog`
* **Purpose:** Guarding irreversible or destructive actions (Disconnecting key, purging memory, dropping updates).
* **Props:** `isOpen: boolean`, `title: string`, `description: string`, `confirmText: string`, `confirmVariant?: 'danger' | 'primary'`, `requiresTypingWord?: string`, `onConfirm: () => void`, `onCancel: () => void`.
* **Accessibility:** `role="alertdialog"`, traps focus inside dialog, ESC key triggers cancel.

### 6.2 `Toast`
* **Purpose:** Ephemeral non-blocking notifications for action outcomes (Key saved, test passed, memory deleted).
* **Props:** `type: 'success' | 'error' | 'info'`, `message: string`, `durationMs?: number`.
* **Accessibility:** `role="status"` or `role="alert"`, `aria-live="polite"`.

---

## Shared Component Matrix Across Pages

| Component Name | Overview | Providers | Routing | Memory | Tasks | Telegram | Diagnostics | Setup | Settings |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `AppShell` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (Wizard) | ✅ |
| `Button` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `StatusBadge` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `DataTable` | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `PasswordKeyInput`| ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `MaskedKeyPill` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ProviderCard` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `MemoryGraph` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `TerminalConsole`| ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `ConfirmDialog` | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
