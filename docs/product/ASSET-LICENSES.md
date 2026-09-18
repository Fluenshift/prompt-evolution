# Bundled asset licenses

The production bundle contains no font files, images, logos, or third-party
runtime requests. The favicon is original inline SVG in a data URL; typography
uses the system font stack; graphs are CSS.

| Asset | Source | Version | License |
| --- | --- | --- | --- |
| Interface icons | [`lucide-react`](https://github.com/lucide-icons/lucide) | 1.39.0 | ISC; Feather-derived icons MIT |
| Utility and theme CSS | [`tailwindcss`](https://github.com/tailwindlabs/tailwindcss) | 4.3.3 | MIT |
| Animation CSS | [`tw-animate-css`](https://github.com/Wombosvideo/tw-animate-css) | 1.4.0 | MIT |
| Theme source (`shadcn/tailwind.css`) | [`shadcn`](https://github.com/shadcn-ui/ui) | 4.19.1 | MIT |
| Toast component, CSS, embedded status icons | [`sonner`](https://github.com/emilkowalski/sonner) | 2.0.8 | MIT |

All permit redistribution with the copyright and license notice retained.

Re-check by walking imports from `apps/web/src/main.tsx`, static files under
`apps/web` and `packages/ui`, and installed dependency license metadata.
Test-only and dev-only modules are not in the bundle.
