// Built-in frontend & design Skills. Enabled skills are injected into the AI system prompt.
export interface Skill { id: string; name: string; category: string; icon: string; desc: string; prompt: string; default?: boolean }

export const SKILLS: Skill[] = [
  {
    id: "m3e-skill", name: "Material 3 Expressive", category: "Design system", icon: "palette", default: true,
    desc: "Shape morphing, springy motion, bold tonal color, large pill controls.",
    prompt: "Apply Material 3 Expressive: dynamic tonal color roles, very large corner radii, pill buttons that morph on press, emphasized display type, pill-indicator navigation bars, FABs, floating toolbars, springy motion (cubic-bezier(.34,1.56,.64,1)).",
  },
  {
    id: "hig-skill", name: "Apple HIG", category: "Design system", icon: "phone_iphone",
    desc: "iOS 26 Liquid Glass, large titles, grouped lists, SF-style tab bars.",
    prompt: "Follow Apple HIG: large collapsing titles, grouped inset lists, translucent materials, tab bar with ≤5 items, 44pt targets, system blue tint, bottom sheets with grabbers.",
  },
  {
    id: "fluent-skill", name: "Fluent 2", category: "Design system", icon: "grid_view",
    desc: "Windows 11 acrylic/mica, NavigationView, 4px radius controls.",
    prompt: "Follow Fluent 2: Segoe UI Variable, mica/acrylic, 4px radii, NavigationView left pane, CommandBar, subtle strokes, depth with tonal layers and 1px strokes.",
  },
  {
    id: "shadcn-skill", name: "shadcn/ui + Tailwind", category: "Design system", icon: "crop_square",
    desc: "Radix primitives look. Clean, neutral, composable.",
    prompt: "Follow the shadcn/ui look: zinc neutrals, 1px borders, h-9 controls, rounded-lg, 1px borders for depth, Inter. When asked for code, output React + Tailwind using shadcn component conventions.",
  },
  {
    id: "mobile-nav", name: "Mobile navigation patterns", category: "Frontend", icon: "smartphone", default: true,
    desc: "Bottom nav, top app bars, sheets, gestures, safe areas.",
    prompt: "For mobile screens (390×844): include a 48–54px status bar area, a top app bar, safe-area padding bottom 24px, a bottom navigation bar with 3–5 destinations (active state clearly shown) and ≥48px touch targets. Make tabs interactive with tiny inline JS.",
  },
  {
    id: "responsive", name: "Responsive & adaptive layout", category: "Frontend", icon: "width", default: true,
    desc: "Fluid grids, breakpoints, rail ↔ bottom-nav adaptation.",
    prompt: "Design for compact (<600), medium (600–839) and expanded (≥840) widths. Use CSS grid/flex with clamp() typography, container-friendly spacing, and switch bottom nav → rail → sidebar as width grows.",
  },
  {
    id: "a11y", name: "Accessibility (WCAG 2.2 AA)", category: "Quality", icon: "accessibility_new", default: true,
    desc: "Contrast, focus, labels, semantics, motion preferences.",
    prompt: "Ensure ≥4.5:1 text contrast, visible focus rings, semantic HTML (header/nav/main/button/label), aria-labels for icon-only buttons, ≥48px (mobile) / 32px (desktop) targets, respect prefers-reduced-motion.",
  },
  {
    id: "motion", name: "Micro-interactions & motion", category: "Frontend", icon: "animation",
    desc: "Hover, press, enter animations and transitions that feel alive.",
    prompt: "Add tasteful micro-interactions: press-scale, hover lift, staggered list entrances (animation-delay), tab-switch crossfades, toggles with spring easing. Pure CSS transitions + minimal vanilla JS.",
  },
  {
    id: "states", name: "Empty, loading & error states", category: "Quality", icon: "inbox",
    desc: "Skeletons, empty illustrations, inline errors, success feedback.",
    prompt: "Where relevant, design realistic data (names, amounts, dates) plus a considered empty state, skeleton loaders (shimmer), inline validation errors and success toasts. Never use lorem ipsum.",
  },
  {
    id: "dark", name: "Dark mode & theming", category: "Frontend", icon: "dark_mode",
    desc: "Token-driven light/dark with accessible surfaces.",
    prompt: "Build with CSS custom properties so light/dark can be swapped via prefers-color-scheme or a data-theme attribute. Dark surfaces use tonal lightness steps rather than pure black.",
  },
  {
    id: "dashboard", name: "Dashboards & data viz", category: "Patterns", icon: "bar_chart",
    desc: "KPI cards, inline SVG charts, tables, filters.",
    prompt: "For data UIs: KPI cards with delta chips, inline SVG sparklines/bar/donut charts built with real-looking numbers, sortable-looking tables, filter chips and a date-range control.",
  },
  {
    id: "forms", name: "Forms & onboarding", category: "Patterns", icon: "edit_note",
    desc: "Auth, signup, multi-step, validation, input affordances.",
    prompt: "For forms: clear labels, helper text, inline validation, password reveal, social sign-in, multi-step progress, primary CTA anchored near the thumb zone on mobile.",
  },
  {
    id: "landing", name: "Landing pages & marketing", category: "Patterns", icon: "campaign",
    desc: "Hero, social proof, features, pricing, CTA, footer.",
    prompt: "For landing pages (1280px): sticky nav, hero with a strong value proposition and dual CTA, product visual, logo row, 3–6 feature blocks, testimonial, pricing, final CTA, footer. Use strong hierarchy and generous whitespace.",
  },
  {
    id: "icons", name: "Iconography & imagery", category: "Frontend", icon: "imagesmode", default: true,
    desc: "Inline SVG icons, flat shape art, avatars. No external assets.",
    prompt: "Designs must be fully self-contained: no external network assets. Use Material Symbols-style inline SVG icons, never emoji, flat CSS shapes for imagery, initials avatars.",
  },
  {
    id: "react-export", name: "React + Tailwind export", category: "Code", icon: "code",
    desc: "Convert any screen to clean componentized React/Tailwind code.",
    prompt: "When asked to export or sync code, produce idiomatic, componentized React + TypeScript + Tailwind that matches the existing project conventions (inspect the workspace first). Keep tokens as CSS variables or Tailwind theme.",
  },
  {
    id: "compose-export", name: "Jetpack Compose export", category: "Code", icon: "android",
    desc: "Convert screens to Material 3 Compose (Kotlin) for Android apps.",
    prompt: "When asked for Android code, output Jetpack Compose with Material3 (androidx.compose.material3), MaterialExpressiveTheme where available, Scaffold, NavigationBar, LargeTopAppBar, proper state hoisting and previews.",
  },
  {
    id: "variants", name: "Variant exploration", category: "Workflow", icon: "fork_right", default: true,
    desc: "Generate 2–4 meaningfully different directions to compare.",
    prompt: "When the user asks for an idea or screen without specifying one direction, produce 3 meaningfully different variants (layout, hierarchy, density or mood), each as its own <artboard>, then briefly explain the tradeoffs.",
  },
];
