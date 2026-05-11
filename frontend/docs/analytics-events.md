# Analytics events (shared)

This document defines shared event names and parameters used across navigation and module entry points.

## `nav_click`
Tracks internal navigation clicks.

**Parameters**
- `from_path` (string): current pathname where click happened.
- `target_path` (string): destination pathname or URL.
- `nav_area` (enum): one of:
  - `masthead_primary`
  - `masthead_secondary`
  - `mobile_nav`
  - `homepage_pillar`
- `label` (string): visible link/button label shown to user.

## `external_link_click`
Tracks outbound clicks to external destinations (e.g. Patronite).

**Parameters**
- `destination_domain` (string): destination domain only, e.g. `patronite.pl`.
- `placement` (string): semantic placement identifier for where the link appeared.

## `module_entry`
Tracks first view entry for high-level product modules to build cohorts.

**When fired**
- On first page view of homepage session shell (single mount of `frontend/app/page.tsx`).

**Parameters**
- `module` (enum): one of `tygodnik`, `atlas`, `obietnice`, `posel`, `sondaze`.
