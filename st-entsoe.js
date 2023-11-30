const fetch = require('node-fetch');
const fs = require('fs');
const ip = require('ip');
const path = require('path');
const proc = require('process');
const ps = require('ps-node');
const schedule = require('node-schedule');
const spawn = require('child_process').spawn;
const { XMLParser, XMLBuilder, XMLValidator } = require("fast-xml-parser");

// Set debugging settings and prints
const DEBUG = false;

// Set path to apikey file
const apikey_path = './workspace/apikey';

// Set geographical location for weather API
const country_code = 'fi';
const postal_code = '06150';

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

// Check for any running conflicting processes
async function check_procs() {

    // Currently executing script's name and pid
    const current_filename = path.basename(__filename);
    const current_pid = proc.pid;

    // Conflicting processes to check for [bin, arg]
    const conflicts = [
        ['node', 'st-entsoe.js'],
        ['python', 'st-entsoe.py'],
        ['edgebridge', ''],
        ['python', 'edgebridge.py']
    ];

    // Iterate over all the processes and collect any conflicting processes
    const promise = await new Promise((resolve, reject) => {
        ps.lookup({}, function (err, results) {
            if (err) {
                throw new Error(err);
            }
            let conflict_procs = [];
            results.forEach(function (process) {
                conflicts.forEach(function (conflict) {
                    if (path.basename(process.command).includes(conflict[0])) {
                        let args = process.arguments;
                        if (args.length == 0) args = [''];
                        args.forEach(function (arg) {
                            if (path.basename(arg) === conflict[1] && current_pid != process.pid) {
                                conflict_procs.push(`${process.command} ${arg} (${process.pid})`);
                            }
                        });
                    }
                });
            });

            // Check if any conflicting processes found
            if (conflict_procs.length > 0) {
                const err_msg = `The following processes prevent ${current_filename} from running!\n` +
                    ` ${conflict_procs.join('\n ')}\n\nKill these processes (in Linux) by:\n` +
                    ` kill -9 ${conflict_procs.map((instance) => instance.split(' ').pop().slice(1, -1)).join(' ')}\n`;
                console.log(err_msg);
                reject();
            } else {
                resolve();
            }
        });
    });
    return promise;
}

// Launch edgebridge listener to pass messages to Smartthings hub
async function run_edgebridge() {
    let eb;
    if (process.platform === 'win32')
        eb = spawn(`${__dirname}/edgebridge/edgebridge.exe`, { cwd: `${__dirname}/workspace/`, stdio: 'inherit' });
    else
        eb = spawn('python3', ['-u', `${__dirname}/edgebridge/edgebridge.py`], { cwd: `${__dirname}/workspace/`, stdio: 'inherit' });
}

// Get API keys from the file "apikey"
function keys() {
	let entsoe_token = '';
	let weather_token = '';

	if (fs.existsSync(apikey_path)) {
		const keydata = fs.readFileSync(apikey_path, 'utf8').split('\n');
		entsoe_token = keydata[0] ? keydata[0].trim() : entsoe_token;
		weather_token = keydata[1] ? keydata[1].trim() : weather_token;
	}

	const json = {
		"entsoe_token": entsoe_token,
		"weather_token": weather_token
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

// Control heating by sending a POST request to edgebridge
async function adjust_heat() {

    // Get daily spot prices
    const prices = await get_prices();

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
    if (prices[index] > threshold_price && prices[index] > 40)
        await post_trigger("HeatOff");
    else
        await post_trigger("HeatOn");

    // Debugging prints
    if (DEBUG) {
        console.log(prices);
    }
}

// Begin execution here
(async () => {
    // Check conflicting processes and exit if found
    await check_procs().catch(error => process.exit());

    // Start edgebridge as a child process
    run_edgebridge();

    // Run once and then control heating with set schedule
    adjust_heat();
    schedule.scheduleJob('0 * * * *', adjust_heat);
})();
