# Marca Fandez v1 — azul (legacy)

Snapshot de la marca anterior (azul `#1C64B4` + casita/llave) por si quieres volver.

## Qué incluye

| Archivo | Uso |
|---------|-----|
| `logo.ejs` | Partial del logo en la UI |
| `favicon.svg` + PNGs / apple-touch / icons | Favicon y PWA |
| `img-logo.svg`, `img-logo-mark.svg` | Logos estáticos en `/public/img` |
| `tokens.css` | Variables CSS + Tailwind de referencia |

## Cómo restaurar

1. Copiar `logo.ejs` → `views/partials/logo.ejs`
2. Copiar `favicon.svg` y los PNG → `public/`
3. Restaurar colores en `public/css/main.css` (`:root`) y `views/partials/head.ejs` (bloque `zilo`) con los valores de `tokens.css`
4. En `main.css`, reemplazar `rgba(196, 92, 20` por `rgba(28, 100, 180` y `#C45C14` / `#9A3F0A` por `#1C64B4` / `#15508F`
5. `theme_color` / `theme-color` → `#1C64B4`, fondo → `#F2F3F5`

Fecha del snapshot: julio 2026.
