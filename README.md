# Smartthings edgebridge electricity price feeder (Entso-E API)

The [st-entsoe.js](st-entsoe.js) nodejs program obtains Finnish electricity prices from the [Entso-E Transparency platform API](https://transparency.entsoe.eu/), and sends an http binary request through the [edgebridge project](https://github.com/toddaustin07/edgebridge) to the [LAN Trigger](https://github.com/toddaustin07/lantrigger) edge driver installed on Smartthings. 

NOTE! The device running [st-entsoe.js](st-entsoe.js) should be connected to the same local area network as the Smartthings hub.

## Installation

Clone [edgebridge](https://github.com/toddaustin07/edgebridge/) by
```
git clone https://github.com/toddaustin07/edgebridge.git
```
Clone [st-entsoe](https://github.com/hokkanen/st-entsoe) (this repo) by
```
git clone https://github.com/hokkanen/st-entsoe.git
```

Install npm dependencies by running
```
cd st-entsoe && npm i
```

## Setup
The [work directory](workspace) for [st-entsoe.js](st-entsoe.js) should contain an [API key file](workspace/apikey) with the user-specific Entso-E API key, which can be obtained from [Entso-E Transparency platform](https://transparency.entsoe.eu/).

## Running
Run [edgebridge.py](https://github.com/toddaustin07/edgebridge/edgebridge.py) and [st-entsoe.js](st-entsoe.js) with pm2 by
```
pm2 start edgebridge/edgebridge.py
```
and
```
pm2 start st-entsoe/st-entsoe.js
```

## Edgebridge status monitoring from Smartthings (optional)
In addition to installing the [LAN Trigger](https://github.com/toddaustin07/lantrigger) edge driver for Smartthings app, it may be convenient to install [EdgeBridge Monitor](https://github.com/toddaustin07/edgebridge#optional-edgebridge-server-monitoring) edge driver as well to monitor the online/offline status of the [edgebridge](https://github.com/toddaustin07/edgebridge/) client.
