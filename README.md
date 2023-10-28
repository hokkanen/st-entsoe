# Smartthings edgebridge electricity price feeder (Entso-E API)

The [st-entsoe.py](st-entsoe.py) python program obtains Finnish electricity prices from the [Entso-E Transparency platform API](https://transparency.entsoe.eu/), and sends an http binary request through the [edgebridge project](https://github.com/toddaustin07/edgebridge) to the [LAN Trigger](https://github.com/toddaustin07/lantrigger) edge driver installed on Smartthings. The [edgebridge.py](https://github.com/toddaustin07/edgebridge/edgebridge.py) client is started by [st-entsoe.py](st-entsoe.py) as a subprocess and does not need to be run separately. The `stderr` and `stdout` output streams from [edgebridge.py](https://github.com/toddaustin07/edgebridge/edgebridge.py) subprocess are piped through [st-entsoe.py](st-entsoe.py) `stdout` output stream.

## Installation
Clone repo with the [edgebridge](https://github.com/toddaustin07/edgebridge/) submodule
```
git clone --recurse-submodules https://github.com/hokkanen/st-entsoe.git
```

Install any missing python dependency, usually at least the following:
```
python3 -m pip install entsoe-py
```

## Setup
The [work directory](workspace) for [st-entsoe.py](st-entsoe.py) (and also [edgebridge.py](https://github.com/toddaustin07/edgebridge/edgebridge.py)) should contain an [API key file](workspace/apikey) with the user-specific Entso-E API key, which can be obtained from [Entso-E Transparency platform](https://transparency.entsoe.eu/). The same [work directory](workspace) is also where [edgebridge.py](https://github.com/toddaustin07/edgebridge/edgebridge.py) creates its [.registrations](workspace/.registrations) file, after the Smartthings edge drivers are installed and set up with the correct network configuration.

## Running
Run [st-entsoe.py](st-entsoe.py) in the current terminal instance by
```
python3 st-entsoe.py
```
In Linux, starting with
```
nohup python3 st-entsoe.py&
```
allows the output to be directed to `nohup.out` file and the program to be kept running even if the terminal instance is closed. 

If any conflicting processes are already running (ie, [edgebridge.py](https://github.com/toddaustin07/edgebridge/edgebridge.py) or another instance of [st-entsoe.py](st-entsoe.py)), the program does not start and suggest killing these processes first.

## Edgebridge status monitoring from Smartthings (optional)
In addition to installing the [LAN Trigger](https://github.com/toddaustin07/lantrigger) edge driver for Smartthings app, it may be convenient to install [EdgeBridge Monitor](https://github.com/toddaustin07/edgebridge#optional-edgebridge-server-monitoring) edge driver as well to monitor the online/offline status of the [edgebridge](edgebridge) client.