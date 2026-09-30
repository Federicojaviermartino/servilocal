# Accessibility

ServiLocal targets **WCAG 2.1 level AA**. This document says what that means in
practice here, how it is verified, and — just as importantly — what is not covered.

## Conformance

| | |
|---|---|
| Target | WCAG 2.1 level AA |
| Status | Partially conformant. No known level A or AA failure; the gaps below are level AAA or untested |
| Verified on | Chromium desktop (1440×900) and a Pixel 5 viewport (393 px), light and dark themes, with reflow checked at 320 px |
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
- The same check missed what only appears on some pages or after an action. In
  dark mode the secondary button ("Contact", "Retry", "Cancel") sat at 2.06:1,
  form errors at 3.71:1, the focus outline at 2.45–2.90:1 and the map pop-ups,
  white from Leaflet's stylesheet with the theme's near-white text, at 2.5:1.
  Errors now have their own token per theme (6.47:1 and 6.48:1), the button and
  the outline use the accent, and the pop-ups take the theme's surface. The
  dark-mode check now also covers a service page, a form showing its errors and
  the client dashboard.
- A rating is read, not just seen. The stars were five disabled buttons named
  "Rate with N stars", even when they only showed a score, so a screen reader
  heard five buttons per review and never the score. Showing one is now an image
  named after it ("4.5 out of 5 stars, 3 reviews"); choosing one is a group of
  radio buttons, which announces the one selected and moves with the arrow keys.
- No information is carried by colour alone. Booking states pair a colour with a
  word; an invalid field gets `aria-invalid` and a message tied to it with
  `aria-describedby`, not just a red border. This claim was false for one chart
  until recently: the booking-status doughnut identified its segments by colour
  and revealed the names only on hover, which is no use on a touch screen, by
  keyboard, or to anyone who cannot tell those colours apart. It now carries a
  legend. Automated tooling did not catch it, and neither did we until someone
  looked at the screen.
- Images carry alternative text; decorative icons are `aria-hidden`. Map markers
  are named after their service, and the admin charts carry their data in a table
  for screen readers, next to the drawing.
- Text reflows at 320 px, the width WCAG asks for, without horizontal
  scrolling. It used to be checked at 375, and at 320 a seven-page pagination
  did not fit. Tables and charts, which cannot reflow, sit in their own
  focusable scroll containers.

**Operable**

- The whole application works without a mouse. A skip link is the first tab stop
  on every page; the notification panel closes with `Escape` and returns focus to
  the bell; the admin tab list follows the ARIA pattern — one tab stop, arrows,
  `Home` and `End` inside it, with the arrows reversed in Arabic. Closing the search
  assistant gives focus back to the button that opened it, and changing page in the
  results moves focus to their heading.
- Focus is always visible, including where the real control is visually hidden:
  the registration role cards draw a ring when the hidden radio inside them takes
  focus.
- `prefers-reduced-motion` is honoured. Spinners, skeleton pulses and transitions
  collapse to a near-instant change for anyone who has asked their system for less
  movement, and so does scrolling requested from a script.
- No time limits, no content that flashes.
- Nothing changes on its own when a control changes. The language selector was a
  drop-down that loaded the page on change, so moving through it with the
  keyboard jumped to the next language; it is now a button that opens a list of
  links, and only choosing one navigates.
- Controls are named by what they show. "Sign out" in the header was labelled
  "Close session" in six of the ten languages, so someone driving the page by voice could
  not reach it by saying what they saw. After accepting a booking, focus moves
  to its card instead of being lost with the buttons that disappear.

**Understandable**

- Ten languages, each prerendered, with `lang` and `dir` set on the document root.
  Arabic renders right-to-left, with spacing and corners set by logical properties
  and directional icons mirrored. Messages take their own direction
  (`dir="auto"`), so a message written in Arabic reads right-to-left on a page in
  Spanish, and the other way round.
- Every page has its own title in its language, so the route announcer speaks when
  moving between sections of the dashboard.
- Form errors say what is wrong in words, next to the field, and are tied to it with
  `aria-describedby`, so a screen reader says why a field is invalid. Forms no
  longer rely on the browser's own validation, whose messages come in the
  browser's language rather than the page's and vanish in a bubble: the rules the
  fields declare are checked on submit, each error appears next to its field in
  the page's language, and focus goes to the first one.
- Navigation is in the same place on every page, and the current section is marked
  with `aria-current`, not only with colour.

**Robust**

- Landmarks (`banner`, `main`, `contentinfo`, `navigation`) on every page, with a
  single `main`. Toggle buttons such as the list and map switch expose their state
  with `aria-pressed`, not only with colour.
- Interactive elements use native semantics where possible. Where ARIA is used —
  the tab list, the notification panel — it follows the authoring practices,
  including focus management, which is the part most often skipped.
- Events that only happen visually are announced: an incoming notification updates
  a polite live region, because otherwise its only trace is a ten-pixel red badge.
  A conversation is a `log`, so a reply that arrives over the socket is read out;
  it has a heading with the other person's name, and each message says who wrote
  it, which on screen is only the side and the colour.

## How it is verified

| Check | Tool | Runs |
|-------|------|------|
| WCAG 2.1 A and AA rules on key pages | `@axe-core/playwright` | Every push |
| Landmark rules: one `main`, at the top level | `@axe-core/playwright` | Every push |
| The same rules in dark mode, on every page and the admin panel | `@axe-core/playwright` | Every push |
| A service page in both themes, form errors and the client dashboard in dark mode | `@axe-core/playwright` | Every push |
| The admin panel, tab by tab | `@axe-core/playwright` | Every push |
| Keyboard operation, focus return, ARIA tab pattern | Playwright | Every push |
| Reflow at 320 px with no horizontal scroll | Playwright | Every push |
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
- **Text spacing overrides (1.4.12, level AA) are untested.** Nothing checks the
  layout with increased line, letter and word spacing.
- **No AAA criteria are claimed**, including enhanced contrast (1.4.6).

## Reporting a problem

Accessibility problems are bugs. Open an issue at
[github.com/Federicojaviermartino/servilocal/issues](https://github.com/Federicojaviermartino/servilocal/issues)
describing the page, what you were using and what happened.
