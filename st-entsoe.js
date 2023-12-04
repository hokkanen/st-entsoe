const fetch = require('node-fetch');
const fs = require('fs');
const ip = require('ip');
const schedule = require('node-schedule');
const { XMLParser, XMLBuilder, XMLValidator } = require("fast-xml-parser");

// Set debugging settings and prints
const DEBUG = false;

// Set path to apikey file and heatoff csv
const apikey_path = './workspace/apikey';
const csv_path = './workspace/st-entsoe.csv';

// Set geographical location for weather API
const country_code = 'fi';
const postal_code = '06150';

// SmartThings device for inside temperature (optional, only for csv logging)
const st_device_id = 'a9a99271-4d4b-4344-9c08-e30f38fc3d41';

// Mapping between temperature and heating hours (uses linear interpolation in between points)
const temp_to_hours = [
    { temp: 30, hours: 1 },
    { temp: 20, hours: 2 },
    { temp: 10, hours: 10 },
    { temp: 0, hours: 14 },
    { temp: -10, hours: 18 },
    { temp: -20, hours: 22 },
    { temp: -30, hours: 24 }
];

// Get API keys from the file "apikey"
function keys() {
    let entsoe_token = '';
    let weather_token = '';
    let st_token = '';

    if (fs.existsSync(apikey_path)) {
        const keydata = fs.readFileSync(apikey_path, 'utf8').split('\n');
        entsoe_token = keydata[0] ? keydata[0].trim() : entsoe_token;
        weather_token = keydata[1] ? keydata[1].trim() : weather_token;
        st_token = keydata[2] ? keydata[2].trim() : st_token;
    }

    const json = {
        "entsoe_token": entsoe_token,
        "weather_token": weather_token,
        "st_token": st_token
    };
    return json;
}

// Check the fetch response status
async function check_response(response, type) {
    if (response.status === 200) {
        console.log(`[REQUEST] ${type} query successful (${new Date().toISOString().replace(/[T]/g, ' ').slice(0, 19) + " UTC"})`);
    }
    else {
        console.log(`[ERROR] ${type} query failed (${new Date().toISOString().replace(/[T]/g, ' ').slice(0, 19) + " UTC"})`)
        console.log(` API Status: ${response.status}\n API response: ${response.statusText}`);
    }
    return response.status;
}

// Query Ensto-E API directly to get the daily spot prices
async function get_prices() {

    // Get Entso-E API key
    const api_key = keys().entsoe_token;

    // The date is determined from the UTC+1 time because the 24-hour API price period is from 23:00 yesterday to 23:00 today
    const hour_ahead_utc = new Date(new Date().setTime(new Date().getTime() + (60 * 60 * 1000)));
    const period_start = `${hour_ahead_utc.toISOString().replace(/[-:T.]/g, '').slice(0, 8)}` + `0000`;
    const period_end = `${hour_ahead_utc.toISOString().replace(/[-:T.]/g, '').slice(0, 8)}` + `2300`;

    // Set additional compulsory strings for the API call
    const document_type = `A44`;
    const process_type = `A01`;
    const location_id = `10YFI-1--------U`;

    // Send API get request
    let request = `https://web-api.tp.entsoe.eu/api?securityToken=${api_key}&documentType=${document_type}&processType=${process_type}` +
        `&in_Domain=${location_id}&out_Domain=${location_id}&periodStart=${period_start}&periodEnd=${period_end}`
    const response = await fetch(request).catch(error => console.log(error));

    // Parse the received xml into json and store price information into the returned prices array
    let json_data;
    let prices = [];
    try {
        json_data = new XMLParser().parse(await response.text());
        json_data.Publication_MarketDocument.TimeSeries.Period.Point.forEach(function (entry) {
            prices.push(parseFloat(entry['price.amount']));
        });
    } catch {
        if (`html` in json_data && `body` in json_data.html)
            console.log(`[ERROR] Entso-E API: "${json_data.html.body}" (${new Date().toLocaleString('en-GB')})`);
        else
            console.log(`[ERROR] Cannot parse Entso-E API response! (${new Date().toLocaleString('en-GB')})`);
    }

    return prices;
}

async function get_heating_hours(temp) {
    // If the temperature is above the highest point or below the lowest point, return the corresponding hours
    if (temp >= temp_to_hours[0].temp) return temp_to_hours[0].hours;
    if (temp <= temp_to_hours[temp_to_hours.length - 1].temp) return temp_to_hours[temp_to_hours.length - 1].hours;

    // Find the two points between which the temperature falls
    let i = 0;
    while (temp < temp_to_hours[i].temp) i++;

    // Perform linear interpolation between the two points
    const x1 = temp_to_hours[i - 1].temp, y1 = temp_to_hours[i - 1].hours;
    const x2 = temp_to_hours[i].temp, y2 = temp_to_hours[i].hours;
    const hours = y1 + ((y2 - y1) / (x2 - x1)) * (temp - x1);

    return Math.round(hours);;
}

async function get_inside_temp() {

    // Set API request options
    const options = {
        method: 'GET',
        headers: { Authorization: `Bearer ${keys().st_token}`, 'Content-Type': 'application/json' },
    };

    // Send API get request
    const response = await fetch(`https://api.smartthings.com/v1/devices/${st_device_id}/status`, options).catch(err => console.error(err));

    // Return 0C if the query failed, else return true inside temperature
    if (await check_response(response, 'SmartThings') !== 200)
        return 0.0;
    else
        return (await response.json()).components.main.temperatureMeasurement.temperature.value;
}

async function get_outside_temp() {

    // Get OpenWeatherMap API key
    const api_key = keys().weather_token;

    // Send API get request
    const response = await fetch(
        `http://api.openweathermap.org/data/2.5/weather?zip=${postal_code},${country_code}&appid=${api_key}&units=metric`)
        .catch(error => console.log(error));

    // Return 0C if the query failed, else return true outside temperature
    if (await check_response(response, 'OpenWeatherMap') !== 200)
        return 0.0;
    else
        return (await response.json()).main.temp;
}

async function write_csv(heatoff, price, temp_in, temp_out) {
    // Check if the file already exists and is not empty
    const csv_append = fs.existsSync(csv_path) && !(fs.statSync(csv_path).size === 0);

    // If the file does not exists, create file and add first line
    if (!csv_append)
        fs.writeFileSync(csv_path, 'unix_time,price,heat_on,temp_in,temp_out,\n');

    // Append data to the file
    const unix_time = Math.floor(Date.now() / 1000);
    fs.appendFileSync(csv_path, `${unix_time},${heatoff},${price},${temp_in},${temp_out}\n`);
}

// Control heating by sending a POST request to edgebridge
async function adjust_heat() {

    // Get daily spot prices
    const prices = await get_prices();

    // Get the current inside temperature
    const inside_temp = await get_inside_temp();

    // Get the current outside temperature
    const outside_temp = await get_outside_temp();

    // Calculate the number of heating hours based on the outside temperature
    const heating_hours = await get_heating_hours(outside_temp);

    // Sort the prices array
    const sorted_prices = [...prices].sort((a, b) => a - b);

    // Get the price of the threshold heating hour (most expensive hour with heating on)
    const threshold_price = sorted_prices[heating_hours - 1];

    // Define function for sending a post request to edgebridge
    const post_trigger = async function (device) {
        console.log(`[REQUEST] Sending ${device} POST request to edgebridge! (${new Date().toLocaleString('en-GB')})`);
        const response = await fetch(`http://${ip.address()}:8088/${device}/trigger`, { method: 'POST' }).catch(error => console.log(error));
    }

    // The index maps to the ceiling of the current UTC hour (0 for 23-00, 1 for 00-01, 2 for 01-02)
    const index = parseInt(new Date(new Date().setTime(new Date().getTime() + (60 * 60 * 1000))).getUTCHours());

    // Status print
    console.log(`[STATUS] heating_hours: ${heating_hours} (${outside_temp}C), price[${index - 1}]: ${prices[index]}, threshold_price: ${threshold_price} ` +
        `(${new Date().toISOString().replace(/[T]/g, ' ').slice(0, 19) + " UTC"})`);

    // Send HeatOff request if price higher than threshold and the hourly price is over 4cnt/kWh, else HeatOn
    if (prices[index] > threshold_price && prices[index] > 40) {
        await post_trigger("HeatOff");
        await write_csv(prices[index] / 10.0, 0, inside_temp, outside_temp);
    } else {
        await post_trigger("HeatOn");
        await write_csv(prices[index] / 10.0, 1, inside_temp, outside_temp);
    }

    // Debugging prints
    if (DEBUG) {
        console.log(prices);
    }
}

// Begin execution here
(async () => {
    // Run once and then control heating with set schedule
    adjust_heat();
    schedule.scheduleJob('0 * * * *', adjust_heat);
})();
