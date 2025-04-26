#!/bin/bash
set -euo pipefail

IFACE="wg0"

# Print header
printf "%-8s %-8s %-10s %-20s\n" "Class" "Parent" "Rate" "Matched IP"
printf "%-8s %-8s %-10s %-20s\n" "-----" "------" "----" "----------"

# First, build a map of class → rate
declare -A CLASS_RATES
while read -r line; do
    if [[ "$line" =~ class\ hfsc\ ([^[:space:]]+)\ parent\ ([^[:space:]]+).*\ rate\ ([^[:space:]]+) ]]; then
        classid="${BASH_REMATCH[1]}"
        parent="${BASH_REMATCH[2]}"
        rate="${BASH_REMATCH[3]}"
        CLASS_RATES["$classid"]="$rate"
    fi
done < <(tc class show dev "$IFACE")

# Then, link filters to IP addresses
declare -A CLASS_IPS
while read -r line; do
    if [[ "$line" =~ flowid\ ([^[:space:]]+) ]]; then
        flowid="${BASH_REMATCH[1]}"
    fi
    if [[ "$line" =~ match\ ([0-9a-f]{8})/ffffffff\ at\ 12 ]]; then
        iphex="${BASH_REMATCH[1]}"
        ip=$(printf "%d.%d.%d.%d" \
            0x${iphex:0:2} \
            0x${iphex:2:2} \
            0x${iphex:4:2} \
            0x${iphex:6:2})
        CLASS_IPS["$flowid"]="$ip"
    fi
done < <(tc filter show dev "$IFACE")

# Now print nicely
for classid in "${!CLASS_RATES[@]}"; do
    parent=$(tc class show dev "$IFACE" | grep "$classid" | grep -oP 'parent \K\S+')
    rate="${CLASS_RATES[$classid]}"
    ip="${CLASS_IPS[$classid]:-(default)}"
    printf "%-8s %-8s %-10s %-20s\n" "$classid" "$parent" "$rate" "$ip"
done