#!/bin/bash
#
git checkout .
git pull
git submodule init
git submodule update
git submodule status
rm -rf ./node_modules/
npm install
pm2 flush
pm2 restart "Monitor Service"
