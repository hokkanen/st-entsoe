# SmartThings edgebridge electricity price feeder

The [st-entsoe.js](st-entsoe.js) nodejs program obtains Finnish electricity prices from [Entso-E Transparency platform API](https://transparency.entsoe.eu/) or [Elering API](https://dashboard.elering.ee/assets/api-doc.html) (backup), and sends an http binary request through the [edgebridge project](https://github.com/toddaustin07/edgebridge) to the [LAN Trigger](https://github.com/toddaustin07/lantrigger) edge driver installed on SmartThings. 

NOTE! The device running [st-entsoe.js](st-entsoe.js) should be connected to the same local area network as the SmartThings hub.

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
The [work directory](workspace) for [st-entsoe.js](st-entsoe.js) should contain an [API key file](workspace/apikey) with the user-specific [Entso-E](https://transparency.entsoe.eu/) (first), [OpenWeatherMap](https://home.openweathermap.org/) (second), and [SmartThings](https://account.smartthings.com/tokens) (third) API key, which can be obtained freely by registering to these services. If the [OpenWeatherMap](https://home.openweathermap.org/) and [SmartThings](https://account.smartthings.com/tokens) API keys are not set (ie, these API queries fail), the inside and outside temperatures are simply set to `0` degrees Celsius. However, inside temperature is only used for csv logging, and does not impact the heat adjustment algorithm.

## Running
Run [edgebridge.py](https://github.com/toddaustin07/edgebridge/edgebridge.py) and [st-entsoe.js](st-entsoe.js) with pm2 by
```
pm2 start edgebridge/edgebridge.py --interpreter python3 -- -u
```
and
```
pm2 start st-entsoe/st-entsoe.js
```

## Create persistent app list
Make `pm2` restart automatically after reboot by
```
pm2 startup
```
and following the instructions. After all desired apps have been started, save the app list by

```
pm2 save
```
so the apps will respawn after reboot. After a `nodejs` upgrade the startup script should be updated by running `pm2 unstartup` and `pm2 startup`.

## Edgebridge status monitoring from SmartThings (optional)
In addition to installing the [LAN Trigger](https://github.com/toddaustin07/lantrigger) edge driver for SmartThings app, it may be convenient to install [EdgeBridge Monitor](https://github.com/toddaustin07/edgebridge#optional-edgebridge-server-monitoring) edge driver as well to monitor the online/offline status of the [edgebridge](https://github.com/toddaustin07/edgebridge/) client.
