const fetch = require('node-fetch');
const fs = require('fs');
const ip = require('ip');
const schedule = require('node-schedule');
const { XMLParser, XMLBuilder, XMLValidator } = require("fast-xml-parser");

// Set debugging settings and prints
const DEBUG = false;

// Set path to apikey file and output csv
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

function date_string() {
    const now = new Date();
    const time = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:${now.getUTCSeconds().toString().padStart(2, '0')}`;
    const date = `${now.getUTCDate().toString().padStart(2, '0')}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-${now.getUTCFullYear()}`;
    return `${time} ${date} UTC`;
}

// Check the fetch response status
async function check_response(response, type) {
    if (response.status === 200) {
        console.log(`[${date_string()}] ${type} query successful!`);
    }
    else {
        console.log(`[ERROR ${date_string()}] ${type} query failed!`)
        console.log(` API Status: ${response.status}\n API response: ${response.statusText}`);
    }
    return response.status;
}

// Query Ensto-E API directly to get the daily spot prices
async function query_entsoe_prices(start_date, end_date) {

    // Get Entso-E API key
    const api_key = keys().entsoe_token;

    // Format the dates into the required string format at 23:00 UTC
    const period_start = `${start_date.toISOString().replace(/[-:T.]/g, '').slice(0, 8)}` + `2300`;
    const period_end = `${end_date.toISOString().replace(/[-:T.]/g, '').slice(0, 8)}` + `2300`;

    // Set additional compulsory strings for the API call
    const document_type = `A44`;
    const process_type = `A01`;
    const location_id = `10YFI-1--------U`;

    // Send API get request to Entso-E
    const request = `https://web-api.tp.entsoe.eu/api?securityToken=${api_key}&documentType=${document_type}&processType=${process_type}` +
        `&in_Domain=${location_id}&out_Domain=${location_id}&periodStart=${period_start}&periodEnd=${period_end}`
    const response = await fetch(request).catch(error => console.log(error));

    // Get prices (if query fails, empty array is returned)
    let prices = [];
    if (await check_response(response, 'Entsoe-E') === 200) {
        // Parse the received xml into json and store price information into the returned prices array
        let json_data;
        try {
            json_data = new XMLParser().parse(await response.text());
            json_data.Publication_MarketDocument.TimeSeries.Period.Point.forEach(function (entry) {
                prices.push(parseFloat(entry['price.amount']));
            });
        } catch {
            console.log(`[ERROR ${date_string()}] Cannot parse prices from the Entsoe-E API response!`)
            try {
                console.log(` Code: ${json_data.Acknowledgement_MarketDocument.Reason.code}\n Message: ${json_data.Acknowledgement_MarketDocument.Reason.text}`);
            } catch {
                console.log(` Cannot find error code or message!`);
            }
        }
    }

    return prices;
}

// Query Elering API directly to get the daily spot prices
async function query_elering_prices(start_date, end_date) {

    // Format the dates into ISO 8601 string format at 23:00 UTC
    const period_start = `${start_date.toISOString().slice(0, 11)}23:00:00.000Z`;
    const period_end = `${end_date.toISOString().slice(0, 11)}23:00:00.000Z`;

    // Encode the ISO strings for the API call
    const encoded_period_start = encodeURIComponent(period_start);
    const encoded_period_end = encodeURIComponent(period_end);

    // Send API get request to Elering
    const response = await fetch(`https://dashboard.elering.ee/api/nps/price?start=${encoded_period_start}&end=${encoded_period_end}`)
        .catch(error => console.log(error));

    // Get prices (if query fails, empty array is returned)
    let prices = [];
    if (await check_response(response, 'Elering') === 200)
        try {
            // Elering API returns only the current price for now, so use that for all hours (only the current hour is used anyway)
            let json_data = await response.json();
            json_data.data[country_code].forEach(function (entry) {
                prices.push(parseFloat(entry['price']));
            });
        } catch {
            console.log(`[ERROR ${date_string()}] Cannot parse prices from the Elering API response!`)
        }

    return prices;
}


// Get daily sport prices from Entso-E API or Elering API (backup)
async function get_prices() {

    // The date is determined from the UTC+1 time because the 24-hour API price period is from 23:00 yesterday to 23:00 today
    const start_date = new Date(new Date().setTime(new Date().getTime() - (23 * 60 * 60 * 1000)));
    const end_date = new Date(new Date().setTime(new Date().getTime() + (60 * 60 * 1000)));

    // Query Entso-E API for the daily sport prices
    let prices = await query_entsoe_prices(start_date, end_date);

    // If Entso-E API fails, use Elering API as a backup
    if (prices.length === 0)
        prices = await query_elering_prices(start_date, end_date);

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

async function write_csv(price, heaton, temp_in, temp_out) {
    // Check if the file already exists and is not empty
    const csv_append = fs.existsSync(csv_path) && !(fs.statSync(csv_path).size === 0);

    // If the file does not exists, create file and add first line
    if (!csv_append)
        fs.writeFileSync(csv_path, 'unix_time,price,heat_on,temp_in,temp_out,\n');

    // Append data to the file
    const unix_time = Math.floor(Date.now() / 1000);
    fs.appendFileSync(csv_path, `${unix_time},${price.toFixed(3)},${heaton},${temp_in.toFixed(1)},${temp_out.toFixed(1)}\n`);
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
        console.log(`[${date_string()}] Sending ${device} POST request to edgebridge!`);
        const response = await fetch(`http://${ip.address()}:8088/${device}/trigger`, { method: 'POST' }).catch(error => console.log(error));
    }

    // The index maps to the ceiling of the current UTC hour (0 for 23-00, 1 for 00-01, 2 for 01-02)
    const index = parseInt(new Date(new Date().setTime(new Date().getTime() + (60 * 60 * 1000))).getUTCHours());

    // Status print
    console.log(`[${date_string()}] heating_hours: ${heating_hours} (${outside_temp}C), price[${index - 1}]: ${prices[index]}, threshold_price: ${threshold_price}`);

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
