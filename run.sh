#!/bin/bash

cd $(pwd)/workspace
nohup python3 ../edgebridge/edgebridge.py&
nohup python3 ../st-entsoe.py&
