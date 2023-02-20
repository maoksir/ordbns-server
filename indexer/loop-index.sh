#!/bin/bash

until node index-bns.js; do
    echo "Script crashed with exit code $?.  Respawning.." >&2
    sleep 10
done
