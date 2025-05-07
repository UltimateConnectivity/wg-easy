#!/bin/bash
set -e

WG_IFACE="wg0" # WireGuard interface
IFACE="ifb0"   # or your interface
RATE="500mbit"   # total allowed bandwidth
FLOWS=65536    # number of simultaneous flows tracked
LIMIT=1024     # max packets in queue
TARGET="5ms"
INTERVAL="100ms"

# IFB device must be created before running this script
echo "[INFO] Setting up root qdisc on $IFACE..."
if ! ip link show "$IFACE" >/dev/null 2>&1; then
    ip link add "$IFACE" type ifb
fi
ip link set dev "$IFACE" up

# Mirror WireGuard ingress into ifb0
tc qdisc add dev "$WG_IFACE" handle ffff: ingress || true
tc filter add dev "$WG_IFACE" parent ffff: protocol all u32 match u32 0 0 \
    action mirred egress redirect dev "$IFACE"

# Clear existing qdiscs
tc qdisc del dev "$IFACE" root || true

# Create HFSC root qdisc
tc qdisc add dev "$IFACE" root handle 1: hfsc default 1

# Create one child class under root
tc class add dev "$IFACE" parent 1: classid 1:1 hfsc sc rate "$RATE"

# Attach fq_codel to the class
tc qdisc add dev "$IFACE" parent 1:1 handle 10: fq_codel \
    limit "$LIMIT" \
    flows "$FLOWS" \
    target "$TARGET" \
    interval "$INTERVAL"

echo "✅ tc setup complete: $RATE limited on $IFACE with FQ_CoDel fairness"