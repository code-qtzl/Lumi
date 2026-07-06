# Design System Integration

A Claude Code skill that applies a warm, distinctive design system to any existing unstyled application.

Point it at an unstyled app. It reads the existing markup, identifies components, and integrates the full design system — tokens, typography, interactive elements, animations, and responsive behavior — directly into your project files.

## Who is this for?

Developers and vibe coders who have a **working but unstyled application** and want to give it a polished, professional look without designing from scratch. You've built the functionality — now make it beautiful.

**Your goals are practical:**

- Apply a cohesive visual identity to an existing app (colors, typography, spacing)
- Add interactive polish (scroll animations, transitions, hover states)
- Make the app responsive across devices
- Get a distinctive look that isn't the default Bootstrap/Tailwind aesthetic

## What the design system includes

- **Warm color palette** — off-white backgrounds, warm grays, bold accent colors (not cold whites or purple gradients)
- **Distinctive typography** — Bricolage Grotesque for headings, DM Sans for body, JetBrains Mono for code
- **Full token system** — CSS custom properties for colors, spacing, shadows, borders, and animations
- **17 interactive component patterns** — quizzes, code translations, chat animations, data flow diagrams, architecture diagrams, tooltips, cards, and more
- **Scroll-triggered animations** — reveal-on-scroll with stagger support
- **Responsive breakpoints** — tablet and mobile adaptations baked in
- **Dark code blocks** — Catppuccin-inspired syntax highlighting

## How to use

### As a Claude Code skill

1. Copy the `codebase-review` folder into `~/.claude/skills/`
2. Open any project with an unstyled frontend
3. Say: _"Style this app with the design system"_

### Trigger phrases

- "Style this app"
- "Apply the design system"
- "Make this look good"
- "Add styling to this project"
- "Integrate the design system"

## Design philosophy

### Warm, not clinical

Off-white backgrounds like aged paper, warm shadows, bold accent colors. This is a developer notebook aesthetic — inviting and distinctive, never cold or corporate.

### Tokens, not magic numbers

Every color, spacing value, font size, and shadow is a CSS custom property. Change the accent color once and it flows everywhere. Consistent and maintainable.

### Progressive enhancement

Start with the base tokens (colors, typography, spacing), then layer on components, animations, and interactivity as needed. The design system works incrementally — you don't need everything at once.

### Responsive by default

Every component pattern includes tablet and mobile breakpoints. Layouts stack, type scales down, spacing tightens — all handled.

## Skill structure

```
codebase-review/
├── SKILL.md                          # Main skill instructions
└── references/
    ├── design-system.md              # CSS tokens, typography, colors, layout
    └── interactive-elements.md       # Component patterns (quizzes, animations, cards, etc.)
```

---
