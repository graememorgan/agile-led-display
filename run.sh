#!/bin/bash

rmmod snd-bcm2835
cd server
PATH=$PATH:/home/myuser/.nvm/versions/node/v22.12.0/bin npm run dev
