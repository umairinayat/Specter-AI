/**
 * Generate app icons for Specter AI
 * Creates icon.png (512x512), icon.ico (Windows), and sized PNGs for Linux
 *
 * Icon design: A stylized ghost/specter "S" on a violet gradient circle
 * Brand color: #7C3AED (violet-600)
 */
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')
const pngToIcoModule = require('png-to-ico')
const pngToIco = pngToIcoModule.default || pngToIcoModule

const BUILD_DIR = path.join(__dirname, '..', 'build-resources')
const ASSETS_DIR = path.join(__dirname, '..', 'assets')
const ICONS_DIR = path.join(BUILD_DIR, 'icons')

// Ensure directories exist
for (const dir of [BUILD_DIR, ASSETS_DIR, ICONS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/**
 * Create an SVG icon for Specter:
 * - Rounded rectangle background with violet gradient
 * - Stylized "S" letter with a ghostly glow effect
 * - Modern, clean, recognizable at small sizes
 */
function createSvgIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B5CF6"/>
      <stop offset="100%" style="stop-color:#6D28D9"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#C4B5FD;stop-opacity:0.4"/>
      <stop offset="100%" style="stop-color:#7C3AED;stop-opacity:0"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#1e1b4b" flood-opacity="0.3"/>
    </filter>
    <filter id="innerGlow">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background rounded rectangle -->
  <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="url(#bg)"/>

  <!-- Subtle inner glow -->
  <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="url(#glow)"/>

  <!-- Ghost/Specter shape - a stylized S with ethereal qualities -->
  <g filter="shadow" transform="translate(256, 256)">
    <!-- Main specter body - flowing S-curve ghost shape -->
    <path d="
      M -20 -160
      C 80 -160, 120 -120, 120 -70
      C 120 -20, 60 10, -10 10
      C -60 10, -100 30, -100 70
      C -100 120, -40 155, 40 155
      L 40 170
      C -50 170, -120 135, -120 75
      C -120 20, -60 -10, 10 -10
      C 60 -10, 100 -35, 100 -70
      C 100 -110, 60 -140, -20 -140
      Z
    " fill="white" opacity="0.95"/>

    <!-- Ghost head/top circle accent -->
    <circle cx="-20" cy="-155" r="28" fill="white" opacity="0.95"/>

    <!-- Ethereal trailing wisps at bottom -->
    <path d="
      M 10 155 Q 0 180, -15 175
      M 40 160 Q 35 185, 20 180
      M 60 150 Q 60 178, 48 175
    " stroke="white" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.7"/>

    <!-- Eye dots on the ghost -->
    <circle cx="-35" cy="-145" r="7" fill="#7C3AED" opacity="0.8"/>
    <circle cx="-5" cy="-145" r="7" fill="#7C3AED" opacity="0.8"/>
  </g>
</svg>`
}

/**
 * Alternative simpler icon - clean "S" monogram
 * Better readability at small sizes like 16x16 tray icon
 */
function createSimpleSvgIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B5CF6"/>
      <stop offset="100%" style="stop-color:#6D28D9"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="url(#bg2)"/>
  <text x="256" y="340" font-family="Arial, Helvetica, sans-serif" font-size="320" font-weight="bold"
    fill="white" text-anchor="middle" opacity="0.95">S</text>
</svg>`
}

async function main() {
  console.log('Generating Specter AI icons...')

  // Generate the main 512x512 PNG
  const svg512 = Buffer.from(createSvgIcon(512))
  const png512 = await sharp(svg512).resize(512, 512).png().toBuffer()
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), png512)
  console.log('  ✓ build-resources/icon.png (512x512)')

  // Also save to assets for the app to use at runtime
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon.png'), png512)
  console.log('  ✓ assets/icon.png (512x512)')

  // Generate tray icon (16x16 and 32x32) - use simpler design for small sizes
  const svgTray = Buffer.from(createSimpleSvgIcon(32))
  const pngTray16 = await sharp(svgTray).resize(16, 16).png().toBuffer()
  const pngTray32 = await sharp(svgTray).resize(32, 32).png().toBuffer()
  fs.writeFileSync(path.join(ASSETS_DIR, 'tray-icon.png'), pngTray32)
  fs.writeFileSync(path.join(ASSETS_DIR, 'tray-icon@2x.png'), pngTray32)
  console.log('  ✓ assets/tray-icon.png (32x32)')

  // Generate Windows .ico (multi-size: 16, 32, 48, 64, 128, 256)
  const icoSizes = [16, 32, 48, 64, 128, 256]
  const icoPngs = await Promise.all(
    icoSizes.map(async (size) => {
      const svg = Buffer.from(size <= 32 ? createSimpleSvgIcon(size) : createSvgIcon(size))
      return sharp(svg).resize(size, size).png().toBuffer()
    })
  )
  const icoBuffer = await pngToIco(icoPngs)
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuffer)
  console.log(`  ✓ build-resources/icon.ico (${icoSizes.join(', ')}px)`)

  // Generate Linux icons (sized PNGs in icons/ directory)
  const linuxSizes = [16, 32, 48, 64, 128, 256, 512]
  for (const size of linuxSizes) {
    const svg = Buffer.from(size <= 32 ? createSimpleSvgIcon(size) : createSvgIcon(size))
    const png = await sharp(svg).resize(size, size).png().toBuffer()
    fs.writeFileSync(path.join(ICONS_DIR, `${size}x${size}.png`), png)
  }
  console.log(`  ✓ build-resources/icons/ (${linuxSizes.map(s => s + 'x' + s).join(', ')})`)

  // macOS .icns - electron-builder can generate from icon.png, but we provide the source
  // For actual .icns generation, electron-builder handles it from the 512x512 PNG
  // We also create a 1024x1024 for Retina
  const svg1024 = Buffer.from(createSvgIcon(1024))
  const png1024 = await sharp(svg1024).resize(1024, 1024).png().toBuffer()
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.icns.png'), png1024)
  console.log('  ✓ build-resources/icon.icns.png (1024x1024 source for icns)')

  console.log('\nDone! All icons generated successfully.')
  console.log('Note: macOS .icns will be generated by electron-builder from icon.png')
}

main().catch(console.error)
