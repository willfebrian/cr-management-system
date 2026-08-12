# Release Candidate Server Search Design

**Date:** 2026-08-12

## Design

The Release candidates endpoint accepts an optional `q` parameter and applies a case-insensitive database filter to transport number, description, and owner before the existing result limit. The unfiltered initial list remains capped at 50 rows.

The Release search input sends the trimmed value after a 300 ms debounce. Candidate requests are sequence-guarded so a slower older response cannot replace a newer search. Target changes and successful Sync CR refreshes retain the active search value.

