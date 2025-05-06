# There's an issue with node:20-alpine.
# Docker deployment is canceled after 25< minutes.

FROM docker.io/library/node:lts-alpine AS build_node_modules

# Copy Web UI
COPY src/ /app/
WORKDIR /app
RUN npm ci --omit=dev

# Copy build result to a new image.
# This saves a lot of disk space.
FROM oven/bun:alpine
COPY --from=build_node_modules /app /app

# Move node_modules one directory up, so during development
# we don't have to mount it in a volume.
# This results in much faster reloading!
#
# Also, some node_modules might be native, and
# the architecture & OS of your development machine might differ
# than what runs inside of docker.
RUN mv /app/node_modules /node_modules

# Install Linux packages
RUN apk add -U --no-cache \
    dpkg \
    curl \
    dumb-init \
    iptables \
    iptables-legacy \
    wireguard-tools

RUN /app/install-wgcf.sh
RUN wgcf register --accept-tos
RUN wgcf generate
RUN mkdir -p /etc/wireguard && \
    mv wgcf-profile.conf /etc/wireguard/wgcf.conf

# Use iptables-legacy
RUN update-alternatives --install /sbin/iptables iptables /sbin/iptables-legacy 10 --slave /sbin/iptables-restore iptables-restore /sbin/iptables-legacy-restore --slave /sbin/iptables-save iptables-save /sbin/iptables-legacy-save

# Expose Ports
EXPOSE 51820/udp
EXPOSE 51821/tcp

# Set Environment
ENV DEBUG=Server,WireGuard
ENV NODE_ENV=production

# Run Web UI
WORKDIR /app
CMD ["/usr/bin/dumb-init", "sh", "-c", "wg-quick up wgcf && exec bun run server.js"]
