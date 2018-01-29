#!/bin/bash
#
git checkout .
git pull
git submodule init
git submodule update
git submodule status
npm install
pm2 flush
pm2 restart "Monitor Service"
