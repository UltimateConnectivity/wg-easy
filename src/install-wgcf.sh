#!/bin/sh
set -e

ARCH=$(uname -m)
WGCF_VERSION=$(curl -s https://api.github.com/repos/ViRb3/wgcf/releases/latest | grep '"tag_name":' | cut -d'"' -f4)

# Map architecture names
case "$ARCH" in
  x86_64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "Unsupported architecture: $ARCH" && exit 1 ;;
esac

URL="https://github.com/ViRb3/wgcf/releases/download/${WGCF_VERSION}/wgcf_${WGCF_VERSION#v}_linux_${ARCH}"

echo "Downloading wgcf ${WGCF_VERSION} for ${ARCH}..."
curl -L "$URL" -o wgcf

echo "Installing to /usr/local/bin..."
install -m 755 wgcf /usr/local/bin/wgcf

echo "Cleaning up..."
rm -f wgcf

echo "✅ wgcf installed successfully!"