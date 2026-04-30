# Recipe: UI Mockup

Generate dashboards, marketing pages, app screens, and design-system mockups that look like real products instead of generic AI mush. See `references/ui-mockup-prompting.md` for the full doctrine — this recipe is the boiled-down playbook.

## When to use

- Dashboard, settings page, or admin UI mockup
- Marketing landing page hero or section
- Mobile app screen
- Design-system component sheet (buttons, cards, form states)
- Empty-state illustration in context
- Reference visual for a developer or designer to reconstruct

## When NOT to use

- Production UI — generate as a reference, build the real thing in code
- Highly interactive prototypes — Figma is better
- Pixel-perfect brand specs — not what generative models do

## Defaults

- **Size:** `1536x1024` (desktop, 3:2) or `1024x1024` (mobile/component) or `1024x1536` (full mobile screen)
- **Quality:** `high`
- **Backend:** API (codex works for single screens but the API is faster for iteration)

## Prompt skeleton — analogy style (creative quality)

Best for atmosphere, mood, and creative-direction mockups:

```
[PRODUCT TYPE: SaaS dashboard / marketing page / mobile app screen]
for [USE CASE].

Visual style: like [REFERENCE 1] meets [REFERENCE 2].
[1-line atmosphere: e.g. "Quiet, focused, single-accent" or "Energetic,
playful, dense"].

Layout: [PROPORTIONAL DESCRIPTION — e.g. "left sidebar, wide center panel,
narrow right activity rail"].

Background: #[HEX]. Accent: #[HEX]. Text: #[HEX].

Content (semantic only, let the model handle layout):
- [KEY ELEMENT WITH REAL DATA]
- [KEY ELEMENT WITH REAL DATA]
- [KEY ELEMENT WITH REAL DATA]

Constraints: no lorem ipsum, no placeholder text, all visible text is
specific and meaningful. Render typography legibly.
```

## Prompt skeleton — inventory style (reliable accuracy)

Best when the content matters more than the vibe:

```
[PRODUCT TYPE] showing the following content:

- [SECTION]: [SPECIFIC DATA, NUMBERS, NAMES]
- [SECTION]: [SPECIFIC DATA, NUMBERS, NAMES]
- [SECTION]: [SPECIFIC DATA, NUMBERS, NAMES]

The model decides the layout. Use clean modern typography (Inter/SF Pro
style). Single accent color: #[HEX]. Background: #[HEX].
Render all text legibly and exactly as specified.
```

## Worked example: SaaS dashboard

```bash
pixeltamer generate -o dashboard.png --size 1536x1024 -p '
SaaS dashboard for a marketing analytics tool, desktop browser view.

Visual style: like Linear meets Notion. Quiet, focused, single-accent,
generous whitespace. Calm but information-dense.

Layout: narrow left sidebar with workspace + nav, wide center panel
with the primary chart, narrow right rail for activity feed.

Background: #ffffff. Accent: #6366F1. Text: #0f172a. Muted: #64748b.

Content (semantic, let the layout breathe):
- Greeting: "Welcome back, Maya" with current date.
- Hero metric: 30-day engagement trendline showing 2.3M views, +18% MoM.
- Three campaign cards: "Q3 Brand Push" (live, 412K reach), "Webinar Series"
  (paused, 38K reach), "Holiday Drop" (draft).
- Right rail activity: "Imported 412 contacts from CSV", "Connected to Linear",
  "Published Q3 Roadmap to staging".

Quick-action bar at the top: "+ New campaign", "Import contacts".

Constraints: no lorem ipsum, no placeholder text, all visible text is
specific and meaningful as listed above. Render typography legibly.
Inter font throughout. No shadows, hairline borders only.
'
```

## Worked example: mobile app screen

```bash
pixeltamer generate -o mobile.png --size 1024x1536 -p '
Mobile app screen for a habit tracker, iPhone-style portrait composition.

Visual style: like Headspace meets Apple Fitness. Calm, encouraging,
single-accent.

Layout: status bar at top, app header with greeting and date, main content
area showing today'\''s habits as cards, tab bar at bottom.

Background: #f9f5f0 (warm cream). Accent: #f97316 (warm orange).
Text: #1c1917.

Content:
- Header: "Good morning, Alex" with "Tuesday, April 30" subtitle.
- Streak banner: "23-day streak — your longest yet"
- Three habit cards stacked vertically:
  • "Morning meditation" (10 min) — completed checkmark
  • "Read 20 pages" — in progress, 12 of 20
  • "Walk 10K steps" — not started, 0 of 10,000
- Bottom tab bar with four icons: Today, Habits, Insights, Profile.

Constraints: realistic SF Pro typography, generous touch targets, no fake
status bar elements (use realistic time + battery). Render all text legibly.
'
```

## Iteration order

When generation is close but wrong, change in this order, ONE at a time:

1. **Content correctness** — wrong data, missing element, hallucinated component → re-prompt with fixed content list.
2. **Color palette** — switch to HEX, specify accent color explicitly.
3. **Density** — "show fewer items per row" or "more breathing room between cards".
4. **Composition** — "move the chart to the right of the page" — be explicit about position.
5. **Typography** — "use sans-serif throughout, no serifs" — only if a wrong typeface persists.

## Common failure modes

| Symptom | Fix |
|---|---|
| Lorem ipsum / placeholder text | Add specific content with real data; explicit "no placeholder text" |
| Wrong typeface | Name the typeface family (Inter, SF Pro, Helvetica Neue) |
| Cramped / too dense | Add "generous whitespace" + cut content items |
| Mushy / generic-AI-dashboard look | Drop praise words; add a specific reference ("like Linear's settings page") |
| Wrong colors | Switch to HEX values; specify background first, accent second |
| Multiple competing accent colors | Cap to one accent; describe everything else as "muted" |
| Pixel widths don't render | Drop them. Use proportional language ("narrow sidebar, wide main") |
