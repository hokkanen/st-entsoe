# Smartthings edgebridge electricity price feeder (Entso-E API)

The st-entsoe.py script obtains Finnish electricity prices from the Entso-E API, and sends an [edgebridge](https://github.com/toddaustin07/edgebridge) http binary request to the [LAN Trigger](https://github.com/toddaustin07/lantrigger) edge driver.

## Installation
Clone repo with edgebridge submodule
```
git clone --recurse-submodules https://github.com/hokkanen/st-entsoe.git
```

Install the missing python dependencies, at least the following:
```
python3 -m pip install entsoe-py
```

## Running
Run edgebridge.py and st-entsoe.py:
```
python3 edgebridge/edgebridge.py
```
```
python3 st-entsoe.py
```
If there is an error about the port being used by another process, try
```
ss -tulpn
```
to see if the pid of the process using the port belongs to an old instance of edgebridge.py and kill it.

## Create a system service that runs automatically
TODO
