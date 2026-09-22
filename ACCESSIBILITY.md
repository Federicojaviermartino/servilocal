# Accessibility

ServiLocal targets **WCAG 2.1 level AA**. This document says what that means in
practice here, how it is verified, and — just as importantly — what is not covered.

## Conformance

| | |
|---|---|
| Target | WCAG 2.1 level AA |
| Status | Partially conformant. No known level A or AA failure; the gaps below are level AAA or untested |
| Verified on | Chromium desktop (1440×900) and a Pixel 5 viewport (375 px), light and dark themes |
| Last checked | Every push — the checks run in CI |

"Partially conformant" is the honest label. Automated tooling catches roughly a
third of WCAG criteria; the rest needs a person, and no person with a screen
reader has audited this yet. Claiming full conformance on the strength of a green
axe run would be the kind of statement this project tries not to make.

## What is implemented

**Perceivable**

- Every colour is a semantic token (`bg-superficie`, `text-principal`), so light
  and dark are two palettes over one set of roles rather than two sets of classes.
  Contrast was measured, not estimated: the muted text token sat at 3.19:1 in dark
  mode and was raised. Brand-coloured text was the last holdout — it named the
  shade rather than the role, and `primary-600` scores 8.72:1 on white but 2.06:1
  on the dark surface. It is now a token too. That one hid because the dark-mode
  check only ever looked at the home page, which has no forms, tables or status
  badges; it now covers every page that the light check does.
- No information is carried by colour alone. Booking states pair a colour with a
  word; an invalid field gets `aria-invalid` and a message tied to it with
  `aria-describedby`, not just a red border. This claim was false for one chart
  until recently: the booking-status doughnut identified its segments by colour
  and revealed the names only on hover, which is no use on a touch screen, by
  keyboard, or to anyone who cannot tell those colours apart. It now carries a
  legend. Automated tooling did not catch it, and neither did we until someone
  looked at the screen.
- Images carry alternative text; decorative icons are `aria-hidden`.
- Text reflows at 375 px without horizontal scrolling. Tables and charts, which
  cannot reflow, sit in their own focusable scroll containers.

**Operable**

- The whole application works without a mouse. A skip link is the first tab stop
  on every page; the notification panel closes with `Escape` and returns focus to
  the bell; the admin tab list follows the ARIA pattern — one tab stop, arrows,
  `Home` and `End` inside it.
- Focus is always visible, including where the real control is visually hidden:
  the registration role cards draw a ring when the hidden radio inside them takes
  focus.
- `prefers-reduced-motion` is honoured. Spinners, skeleton pulses and transitions
  collapse to a near-instant change for anyone who has asked their system for less
  movement.
- No time limits, no content that flashes.

**Understandable**

- Ten languages, each prerendered, with `lang` and `dir` set on the document root.
  Arabic renders right-to-left.
- Form errors say what is wrong in words, next to the field, and are announced.
- Navigation is in the same place on every page, and the current section is marked
  with `aria-current`, not only with colour.

**Robust**

- Landmarks (`banner`, `main`, `contentinfo`, `navigation`) on every page.
- Interactive elements use native semantics where possible. Where ARIA is used —
  the tab list, the notification panel — it follows the authoring practices,
  including focus management, which is the part most often skipped.
- Events that only happen visually are announced: an incoming notification updates
  a polite live region, because otherwise its only trace is a ten-pixel red badge.

## How it is verified

| Check | Tool | Runs |
|-------|------|------|
| WCAG 2.1 A and AA rules on key pages | `@axe-core/playwright` | Every push |
| The same rules in dark mode, on every page and the admin panel | `@axe-core/playwright` | Every push |
| The admin panel, tab by tab | `@axe-core/playwright` | Every push |
| Keyboard operation, focus return, ARIA tab pattern | Playwright | Every push |
| Reflow at 375 px with no horizontal scroll | Playwright | Every push |
| Right-to-left rendering in Arabic | Playwright | Every push |
| Components in isolation, in any locale and theme | Storybook | Built in CI |

Automated rules are a floor, not a ceiling — they are good at contrast and
missing names and blind to whether the page makes sense. The keyboard tests exist
because axe cannot press `Escape`.

## Known gaps

Listed rather than discovered.

- **No audit with a real screen reader.** NVDA, JAWS and VoiceOver each behave
  differently; nothing here has been listened to end to end.
- **Leaflet maps are not keyboard-navigable beyond panning.** Markers cannot be
  reached with the keyboard, so the map is an alternative view of the list, never
  the only way to reach a service. The list view carries the same results.
- **The Stripe Payment Element is a third-party iframe.** Its accessibility is
  Stripe's, not ours. It is now told the page theme and locale, so it no longer
  renders a white block inside a dark page, but what happens inside the frame is
  outside our control and untested by us.
- **Cognitive load has not been formally assessed.** WCAG 2.2 criteria such as
  accessible authentication and consistent help are not addressed.
- **No AAA criteria are claimed**, including enhanced contrast (1.4.6) and text
  spacing overrides (1.4.12).

## Reporting a problem

Accessibility problems are bugs. Open an issue at
[github.com/Federicojaviermartino/servilocal/issues](https://github.com/Federicojaviermartino/servilocal/issues)
describing the page, what you were using and what happened.
