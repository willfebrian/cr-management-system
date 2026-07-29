# Issue Incomplete Navigation Design

## Goal

Improve the Change Issue page so users can collapse Issue Initiation and quickly navigate from grouped incomplete-data summaries to the exact field that needs completion.

## Interaction Design

### Collapsible Issue Initiation

- Render Issue Initiation with the same phase-card header pattern used by DEV Processing, QA Processing, and PRD Processing.
- Include a chevron and `Show`/`Hide` action.
- Keep Issue Initiation expanded when an issue is first opened.
- Preserve all existing Issue Initiation fields and layout inside the collapsible content.

### Grouped Incomplete Summary

- Preserve the total incomplete count in the issue summary.
- Group incomplete fields into these cards:
  - Issue Initiation
  - DEV Processing
  - QA Processing
  - PRD Processing
- Only render a group card when that section contains at least one incomplete field.
- Show the number of incomplete fields in each group.
- Render every incomplete item as an individually clickable control.

### Navigation to Missing Fields

When an incomplete item is selected:

1. Expand its owning section if the section is collapsed.
2. Wait for the target input to be rendered.
3. Scroll the target field into view with smooth positioning.
4. Move keyboard focus to the target input when possible.
5. Apply a temporary visual highlight to make the destination obvious.

If the target is disabled because its lifecycle phase is not ready, the page still expands, scrolls to, and highlights the field without changing lifecycle rules or enabling the input.

## Data Model

Replace display-only missing strings with structured descriptors containing:

- Stable item identifier
- Display label
- Owning section
- Target field identifier

The same descriptors drive the total count, grouping, labels, and navigation. This avoids brittle navigation based on visible text matching.

## Component Boundaries

- The Change Issue container computes structured incomplete groups and renders the summary cards.
- The Issue Editor owns expanded-section state and field references.
- The parent sends a navigation request to the editor using a stable target identifier.
- The editor expands the requested section and performs focus, scroll, and highlight after rendering.

## Accessibility

- Section headers remain native buttons.
- Incomplete items are native buttons with descriptive accessible labels.
- Focus is moved only after explicit user interaction.
- Highlighting complements focus and does not serve as the only indicator.

## Verification

- Regression test verifies Issue Initiation uses the shared collapsible phase-card pattern.
- Regression test verifies incomplete descriptors are grouped into the four expected sections.
- Regression test verifies clicking an incomplete item expands its section and targets the matching field.
- Existing regression test and production build must remain green.
- Browser QA confirms:
  - Issue Initiation Show/Hide works.
  - Cards are grouped correctly.
  - Clicking representative items in each phase navigates to the correct field.
  - Disabled phase fields are still located and highlighted without becoming editable.
