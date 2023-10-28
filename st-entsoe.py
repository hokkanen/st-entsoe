from entsoe import EntsoePandasClient
import datetime
import os
import pandas as pd
import psutil
import requests
import schedule
import subprocess
import threading
import time 

DEBUG = False

# Check for any running conflicting processes
def check_procs():
    # Get the conflicting python script names
    script_name = [os.path.basename(__file__), "edgebridge.py"]
    # Get the current python process id
    current_pid = os.getpid()

    # Iterate over all the processes and collect any conflicting processes
    other_instances = []
    for process in psutil.process_iter():
        if "python" in process.name():
            for script in script_name:
                for arg in process.cmdline():
                    if script == os.path.basename(arg) and process.pid != current_pid:
                        # Append the process + arg and pid to the list
                        other_instances.append((process.name() + " " + arg, process.pid))

    # Check if any conflicting processes found
    if other_instances:
        # Print the name and pid of such processes
        print(f"The following processes prevent", os.path.basename(__file__), "from running!", flush=True) 
        for name, pid in other_instances:
            print(f" {name} {pid}", flush=True)
        # Print a command to kill the processes
        print(f"\nKill these processes (in many systems) by:", flush=True)
        print(f" kill {' '.join(str(pid) for name, pid in other_instances)}", flush=True)
        exit()

# Launch edgebridge listener to pass messages to Smartthings hub
def run_edgebridge(): 
    proc = subprocess.Popen(["python3", "-u", "../edgebridge/edgebridge.py"], cwd = "./workspace/", stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text = True)
    while True:
        line = proc.stdout.readline()
        if line:
            with threading.Lock():
                print(line.strip(), flush=True)
    
# Control heating by querying Ensto-E API and sending a POST request to edgebridge
def heat_control():
    # Get API key from the file "apikey"
    api_key = None
    with open("./workspace/apikey", "r") as f:
        api_key = f.readline()
        api_key = api_key.strip()

    # Set correct options for the API call
    client = EntsoePandasClient(api_key = api_key)
    beginning_of_day = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start = pd.Timestamp(beginning_of_day, tz='Europe/Helsinki')
    end = pd.Timestamp(beginning_of_day + datetime.timedelta(days=1, hours=-1), tz='Europe/Helsinki')
    country_code = 'FI'

    # Set HeatOff if one of 8 most costly hours of the day and the hourly price is over 4cnt/kWh (VAT excluded)
    prices = client.query_day_ahead_prices('FI', start=start, end=end)
    if prices.iloc[datetime.datetime.now().hour] > prices.quantile(0.67) and prices.iloc[datetime.datetime.now().hour] > 40:
        try:
            with threading.Lock(): 
                print("[REQUEST] Sending HeatOff POST request to edgebridge!", "(", datetime.datetime.now().strftime("%d-%m-%Y %H:%M:%S"), ")", flush=True)
            requests.post('http://192.168.1.33:8088/HeatOff/trigger')
        except:
            with threading.Lock(): 
                print("[ERROR] Sending the HeatOff POST request failed at", "(", datetime.datetime.now().strftime("%d-%m-%Y %H:%M:%S"), ")", flush=True)
    else:
        try:
            with threading.Lock(): 
                print("[REQUEST] Sending HeatOn POST request to edgebridge!", "(", datetime.datetime.now().strftime("%d-%m-%Y %H:%M:%S"), ")", flush=True)
            requests.post('http://192.168.1.33:8088/HeatOn/trigger')
        except: 
            with threading.Lock():
                print("[ERROR] Sending the HeatOn POST request failed at", "(", datetime.datetime.now().strftime("%d-%m-%Y %H:%M:%S"), ")", flush=True)

    # Debugging prints
    if DEBUG == True:
        with threading.Lock():
            print("[DEBUG] price[", datetime.datetime.now().hour,"]:", prices.iloc[datetime.datetime.now().hour],", prices.quantile(0.67):", prices.quantile(0.67), "(", datetime.datetime.now().strftime("%d-%m-%Y %H:%M:%S"), ")", flush=True)
            print("[DEBUG] prices:\n",prices, flush=True)

# Begin by checking for conflicting processes
check_procs()

# Start edgebridge by another thread
thread_eb = threading.Thread(target=run_edgebridge, daemon=True)
thread_eb.start()

# Schedule job for every even hour at the 00th minute
if DEBUG == True:
    schedule.every(3).seconds.do(heat_control) # debugging only
else:
    schedule.every().hour.at(":00").do(heat_control)

# Run client indefinitely
while True:
    schedule.run_pending()
    time.sleep(1)
