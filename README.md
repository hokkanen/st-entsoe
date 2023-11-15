# Smartthings edgebridge electricity price feeder (Entso-E API)

The [st-entsoe.js](st-entsoe.js) nodejs program obtains Finnish electricity prices from the [Entso-E Transparency platform API](https://transparency.entsoe.eu/), and sends an http binary request through the [edgebridge project](https://github.com/toddaustin07/edgebridge) to the [LAN Trigger](https://github.com/toddaustin07/lantrigger) edge driver installed on Smartthings. The [edgebridge.py](https://github.com/toddaustin07/edgebridge/blob/main/edgebridge.py) client is started by [st-entsoe.js](st-entsoe.js) as a subprocess and does not need to be run separately. The `stderr` and `stdout` output streams from [edgebridge.py](https://github.com/toddaustin07/edgebridge/blob/main/edgebridge.py) subprocess are piped through [st-entsoe.js](st-entsoe.js) `stdout` output stream.

NOTE! The device running [st-entsoe.js](st-entsoe.js) should be connected to the same local area network as the Smartthings hub.

## Installation
Clone repo with the [edgebridge](https://github.com/toddaustin07/edgebridge/) as a submodule
```
git clone --recurse-submodules https://github.com/hokkanen/st-entsoe.git
```

Install npm dependencies by running
```
npm install .
```

## Setup
The [work directory](workspace) for [st-entsoe.js](st-entsoe.js) (and also [edgebridge.py](https://github.com/toddaustin07/edgebridge/blob/main/edgebridge.py)) should contain an [API key file](workspace/apikey) with the user-specific Entso-E API key, which can be obtained from [Entso-E Transparency platform](https://transparency.entsoe.eu/). The same [work directory](workspace) is also where [edgebridge.py](https://github.com/toddaustin07/edgebridge/blob/main/edgebridge.py) creates its [.registrations](workspace/.registrations) file, after the Smartthings edge drivers are installed and set up with the correct network configuration.

## Running
Run [st-entsoe.js](st-entsoe.js) in the current terminal instance by
```
node st-entsoe.js
```
In Linux, starting with
```
(nohup node st-entsoe.js&)
```
allows the output to be directed to `nohup.out` file and the program to be kept running even if the terminal instance is closed. 

If any conflicting processes are already running (ie, [edgebridge.py](https://github.com/toddaustin07/edgebridge/blob/main/edgebridge.py) or another instance of [st-entsoe.js](st-entsoe.js)), the program does not start and suggest killing these processes first.

## Edgebridge status monitoring from Smartthings (optional)
In addition to installing the [LAN Trigger](https://github.com/toddaustin07/lantrigger) edge driver for Smartthings app, it may be convenient to install [EdgeBridge Monitor](https://github.com/toddaustin07/edgebridge#optional-edgebridge-server-monitoring) edge driver as well to monitor the online/offline status of the [edgebridge](https://github.com/toddaustin07/edgebridge/) client.
