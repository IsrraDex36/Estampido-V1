# Estampido: web + API + WhatsApp bot in ONE container (they talk over localhost
# and share the results folder). Persistent state lives on a volume at /data.
FROM node:24-bookworm-slim

# tini: proper PID 1 (forwards SIGTERM so the bot closes its session cleanly).
# unzip: only used by the bot's pack-capture mode.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl xz-utils tini unzip \
  && rm -rf /var/lib/apt/lists/*

# Recent static FFmpeg (same build as CI): libwebp_anim, libopus and the
# animated-WebP decoder the pipeline needs (distro FFmpeg is too old).
RUN curl -fsSL https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz -o /tmp/ffmpeg.tar.xz \
  && mkdir -p /opt/ffmpeg \
  && tar -xJf /tmp/ffmpeg.tar.xz -C /opt/ffmpeg --strip-components=1 \
  && rm /tmp/ffmpeg.tar.xz \
  && /opt/ffmpeg/bin/ffmpeg -hide_banner -encoders | grep -q libwebp_anim \
  && /opt/ffmpeg/bin/ffmpeg -hide_banner -encoders | grep -q libopus \
  && /opt/ffmpeg/bin/ffmpeg -hide_banner -encoders | grep -q libx264
ENV FFMPEG_PATH=/opt/ffmpeg/bin/ffmpeg \
    FFPROBE_PATH=/opt/ffmpeg/bin/ffprobe

WORKDIR /app

# Dependencies first (cached layer). tsx (dev dep) runs the TypeScript entry points.
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --no-audit --no-fund && npm ci --prefix web --no-audit --no-fund

COPY . .
RUN npm run build:web && npm run check-deps

# Production defaults. Railway injects PORT; secrets/config come from its Variables.
ENV SVA_MODE=production \
    SVA_HOST=0.0.0.0 \
    SVA_TRUST_PROXY=1 \
    SVA_AUTH_DIR=/data/auth \
    SVA_DATA_DIR=/data \
    SVA_COMMUNITY_DIR=/data/community \
    PORT=8787
EXPOSE 8787
# State dir. Railway mounts its volume here (Railway rejects the VOLUME instruction,
# volumes are configured in its dashboard); plain Docker: use -v <vol>:/data.
RUN mkdir -p /data

# Coolify/Docker restart the container if the web stops answering (≈ 2 min of failures).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=4 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8787}/api/health" > /dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
# API (production) + bot, supervised with restart backoff. No tunnel: the platform's proxy is the entry.
CMD ["npx", "tsx", "scripts/start.ts", "--skip-build"]
