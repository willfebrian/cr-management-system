# Linked Issues Card Visual Design

## Objective

Improve the Project Create and Change Linked Issues card so search results and selected Issues are immediately distinguishable, row actions stay compact, and the component remains aligned with the CRMS visual system.

## Approved Layout

Use one parent Linked Issues card containing two clearly labelled sections:

1. **Search Results** appears below the search input and shows matching Issues.
2. **Selected Issues** appears below Search Results and shows Issues currently staged for the Project.

The card header keeps the existing title, supporting description, and selected-count badge. Section separation uses spacing and subtle dividers, not nested cards.

## Issue Rows

Each row uses two columns:

- A flexible information column containing Issue key, description, status, requester, and CR reference.
- A fixed `112px` action column aligned to the right.

All row action buttons are `34px` high and fill the fixed action column. Long Issue descriptions truncate with an ellipsis instead of pushing or resizing the action column.

## Action States

- **Add:** neutral/teal outline action with a plus icon; soft teal hover state.
- **Added:** disabled neutral state with no plus icon.
- **Remove:** neutral outline with a remove icon and restrained destructive text; soft red hover state.
- The Add, Added, and Remove controls have identical width and height.

Save Project remains the only solid teal primary action in the editor footer. Cancel remains a neutral secondary action.

## Selected-Issue Emphasis

The Selected Issues list receives a subtle teal-tinted surface within the parent card. This indicates membership without introducing nested card borders or heavy shadows.

## Responsive Behaviour

- Desktop and tablet: information and fixed-width action columns remain side by side.
- Narrow mobile layouts: the action moves below the Issue information and remains `112px` wide, aligned to the right.
- The component must not introduce horizontal scrolling.

## Scope

The change applies to the shared Project Issue picker used by Project Create and Change. It does not alter Issue selection rules, API payloads, database behaviour, or Project lifecycle logic.

## Verification

- Component tests cover Search Results and Selected Issues headings and Add/Added/Remove states.
- The visual consistency contract covers the fixed action width and two-column row layout.
- Production build and existing Project/User Management test suites must continue to pass.
- Browser inspection confirms desktop alignment and narrow-screen reflow.
