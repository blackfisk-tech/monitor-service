#!/bin/bash
#
git checkout .
git pull
git submodule init
git submodule update
git submodule status
pm2 flush
pm2 restart "Monitor Service"
chmod a+x /home/blackfisk/monitor-service/*.sh