#!/bin/bash
set -e

CONTAINER_NAME="$1"

if [ -z "$CONTAINER_NAME" ]; then
    echo "Usage: $0 <container-name-or-id>"
    exit 1
fi

# Check if ifb0 exists
if ! ip link show ifb0 &> /dev/null; then
    echo "Error: ifb0 does not exist on host. Please run:"
    echo "  sudo modprobe ifb numifbs=1"
    echo "  sudo ip link set ifb0 up"
    exit 1
fi

# Get container PID
PID=$(docker inspect --format '{{.State.Pid}}' "$CONTAINER_NAME")

if [ -z "$PID" ]; then
    echo "Error: Could not find PID for container $CONTAINER_NAME"
    exit 1
fi

echo "Container PID: $PID"

# Move ifb0 into the container's net namespace
echo "Moving ifb0 into container namespace..."
sudo ip link set ifb0 netns "$PID"

# Inside container: bring ifb0 up
echo "Bringing up ifb0 inside container..."
sudo nsenter -t "$PID" -n ip link set ifb0 up

echo "✅ Successfully moved and brought up ifb0 inside container!"