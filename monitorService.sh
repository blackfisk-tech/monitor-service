#!/bin/sh
### BEGIN INIT INFO
# Provides:          MonitorService
# Required-Start:    $network $named
# Required-Stop:     $network $named
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Blackfisk Monitoring Service
# Description:       Handles Blackfisk Online Server Status
### END INIT INFO
#
# Author: Jeremy R DeYoung <jeremy@blackfisk.com>
#
HOSTNAME=$(hostname -f)
BLACKFISKCMD="curl -s -XGET 'https://api.apophisapp.com/iptables/?server=$HOSTNAME&lastAction=$1'"
eval $BLACKFISKCMD
exit 0
