# ─────────────────────────────────────────────────────────────
# Specter AI — Linux CI Build Environment
# Builds AppImage + deb packages inside Docker for reproducible
# cross-platform builds without needing a Linux host machine.
#
# Usage:
#   docker build -t specter-ai:latest -f Dockerfile .
#   docker run --rm -v "$(pwd)/dist:/app/dist" specter-ai:latest
#
# Output: dist/*.AppImage, dist/*.deb
# ─────────────────────────────────────────────────────────────

FROM node:20-bookworm AS builder

# electron-builder needs these for AppImage + deb packaging
RUN apt-get update && apt-get install -y --no-install-recommends \
    libx11-dev \
    libxkbfile-dev \
    libsecret-1-dev \
    libarchive-tools \
    rpm \
    fakeroot \
    dpkg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for the build)
RUN npm ci

# Copy the rest of the source
COPY . .

# Build the Electron app (electron-vite compile)
RUN npm run build

# Build Linux packages (AppImage + deb)
# USE_HARD_LINKS=false is required inside Docker (overlayfs doesn't support hardlinks)
ENV USE_HARD_LINKS=false
RUN npx electron-builder --linux --publish never

# The dist/ folder now contains the built packages.
# Mount a volume at /app/dist to extract them:
#   docker run --rm -v "$(pwd)/dist:/output" specter-ai:latest cp -r /app/dist/. /output/
CMD ["echo", "Build complete. Artifacts in /app/dist/"]
