# Oriel demo prompts

Run `npm run dev` in this directory (serves http://127.0.0.1:5173), open it in a 430-540 px wide window, then paste one prompt into a Claude Code session started in `demo-app/`. FAQ is deliberately absent so prompt 1 can create it.

## Prompt 1: three parallel edits

```
Use the Agent tool to spawn exactly 3 subagents IN PARALLEL, all in a single message, with these descriptions:
1. "Hero rewrite": in src/components/Hero.jsx write a bolder headline, a sharper one-sentence subhead and a new primary CTA label.
2. "Team tier": in src/components/Pricing.jsx add a third pricing card called "Team" ($29 / seat / month, 4 bullet points), and update src/styles/pricing.css so three cards fit, stacking on mobile.
3. "FAQ section": create src/components/FAQ.jsx and src/styles/faq.css with 5 questions using <details>/<summary>, in the existing paper/ink/vermilion style, and add <FAQ /> to src/App.jsx right after <Testimonials />.
Do not do any of this work yourself. When all three finish, run npm run build and report the result.
```

## Prompt 2: polish pass

```
Spawn 3 subagents IN PARALLEL in one message:
1. "Logo cloud refresh": in src/components/LogoCloud.jsx replace the five customers with five new fictional companies, keeping the inline SVG style.
2. "Feature copy": in src/components/Features.jsx tighten every feature title and paragraph, and add a fifth feature card; adjust src/styles/features.css if the grid needs it.
3. "Testimonial swap": in src/components/Testimonials.jsx rewrite all three quotes with concrete numbers (hours saved, meetings cut) and new names.
Delegate everything; then run npm run build to confirm it passes.
```

## Prompt 3: theme and footer

```
Spawn 3 subagents IN PARALLEL in a single message:
1. "Dark footer": restyle src/components/Footer.jsx and src/styles/footer.css as a dark ink footer with a newsletter input and a social links row.
2. "CTA urgency": in src/components/CTA.jsx change the headline and subhead to create gentle urgency, and add a small "No card needed" note under the form; style it in src/styles/cta.css.
3. "Nav upgrade": in src/components/Nav.jsx add a "Docs" link and a "Sign in" link before the Get Oriel button, and update src/styles/nav.css.
Each subagent edits only the files named in its own item. Afterwards run npm run build and summarise.
```
