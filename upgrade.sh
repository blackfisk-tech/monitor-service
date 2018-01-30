#!/bin/bash
#
git checkout .
git pull
git submodule init
git submodule update
git submodule status
npm install
npm upgrade
pm2 flush
pm2 restart "Monitor Service"
