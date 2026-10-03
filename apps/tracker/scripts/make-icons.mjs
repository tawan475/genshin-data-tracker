#!/usr/bin/env node
// Generates the app icons and the web manifest from one mark, drawn here as
// SVG paths (no fonts, so it renders identically everywhere) and rasterised
// with sharp. The manifest is written by this script so it can only name
// files this script produced.
//
//   node scripts/make-icons.mjs

import { writeFileSync } from 'node:fs'
import sharp from 'sharp'

const BG = '#0e1012'
const ACCENT = '#c7f751'
const out = new URL('../public/', import.meta.url)

// A four-point sparkle (primogem-like) on the dark ground.
const sparkle = (scale) => {
  const s = (v) => 50 + (v - 50) * scale
  return `<path fill="${ACCENT}" d="M${s(50)} ${s(12)} Q${s(55)} ${s(45)} ${s(88)} ${s(50)} Q${s(55)} ${s(55)} ${s(50)} ${s(88)} Q${s(45)} ${s(55)} ${s(12)} ${s(50)} Q${s(45)} ${s(45)} ${s(50)} ${s(12)} Z"/>
  <circle cx="${s(76)}" cy="${s(24)}" r="${5 * scale}" fill="${ACCENT}" opacity="0.85"/>`
}

/** Rounded tile for "any" icons; full-bleed square for maskable and iOS. */
const svg = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${rounded ? 22 : 0}" fill="${BG}"/>
  ${sparkle(scale)}
</svg>`

async function png(name, size, options) {
  await sharp(Buffer.from(svg(options)))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(new URL(name, out).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
}

writeFileSync(new URL('favicon.svg', out), svg({ rounded: true, scale: 1 }))
await png('favicon-32.png', 32, { rounded: true, scale: 1 })
await png('icon-192.png', 192, { rounded: true, scale: 1 })
await png('icon-512.png', 512, { rounded: true, scale: 1 })
// Maskable: launchers crop to their own shape; keep the mark inside the 40% safe radius.
await png('icon-maskable-512.png', 512, { rounded: false, scale: 0.78 })
// iOS rounds the corners itself and renders transparency black.
await png('apple-touch-icon.png', 180, { rounded: false, scale: 0.86 })

const manifest = {
  id: '/app',
  name: 'Genshin Tracker',
  short_name: 'GI Tracker',
  description:
    'Your Genshin Impact inventory over time: snapshots, artifacts, materials and exports.',
  start_url: '/app',
  scope: '/',
  display: 'standalone',
  background_color: BG,
  theme_color: BG,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
  shortcuts: [
    { name: 'Accounts', url: '/app', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    { name: 'Settings', url: '/app/settings', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
  ],
  launch_handler: { client_mode: ['navigate-existing', 'auto'] },
}
writeFileSync(new URL('manifest.webmanifest', out), `${JSON.stringify(manifest, null, 2)}\n`)
console.log('icons and manifest written to public/')
