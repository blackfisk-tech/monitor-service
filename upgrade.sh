#!/bin/bash
#
git checkout .
git pull
git submodule init
git submodule update
git submodule status
# handle pm2 processing
pm2 flush
pm2 restart "Monitor Service"
