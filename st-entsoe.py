from entsoe import EntsoePandasClient
import datetime
import pandas as pd
import requests
import schedule
import time

def job():

    # Set correct options for the API call
    client = EntsoePandasClient(api_key="d9268bc7-b025-45e9-8eee-103ed6e84197")
    beginning_of_day = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start = pd.Timestamp(beginning_of_day, tz='Europe/Helsinki')
    end = pd.Timestamp(beginning_of_day + datetime.timedelta(days=1), tz='Europe/Helsinki')
    country_code = 'FI'

    # Set HeatOff if one of 8 most costly hours of the day and the hourly price is over 4cnt/kWh (VAT excluded)
    prices = client.query_day_ahead_prices('FI', start=start, end=end)
    if prices[datetime.datetime.now().hour] > prices.quantile(0.67) and prices[datetime.datetime.now().hour] > 40 :
        try :
          requests.post('http://192.168.1.231:8088/HeatOff/trigger')
        except: 
          print("[ERROR] Sending the HeatOff POST request failed at", datetime.datetime.now())
    else :
        try :
          requests.post('http://192.168.1.230:8088/HeatOn/trigger')
        except: 
          print("[ERROR] Sending the HeatOn POST request failed at", datetime.datetime.now())

    # Debugging prints
    print("[DEBUG] price[",datetime.datetime.now().hour,"]:",prices[datetime.datetime.now().hour],", prices.quantile(0.67):",prices.quantile(0.67))
    print("[DEBUG] prices:\n",prices)

# Debugging scheduler
schedule.every(3).seconds.do(job)

# Run job every even hour at the 00th minute
#schedule.every().hour.at(":00").do(job)
while True:
    schedule.run_pending()
    time.sleep(1)
