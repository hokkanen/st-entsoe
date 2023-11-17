const fetch = require('node-fetch');
const fs = require('fs');
const ip = require('ip');
const path = require('path');
const proc = require('process');
const ps = require('ps-node');
const quantile = require('compute-quantile');
const schedule = require('node-schedule');
const spawn = require('child_process').spawn;
const { XMLParser, XMLBuilder, XMLValidator}  = require("fast-xml-parser");

// Set debugging settings and prints
const DEBUG = false;

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
            }else{
                resolve();     	
            }
        });
    });
    return promise;
}

// Launch edgebridge listener to pass messages to Smartthings hub
async function run_edgebridge() {
    let eb;
    if(process.platform === 'win32')
        eb = spawn(`${__dirname}/edgebridge/edgebridge.exe`, { cwd: `${__dirname}/workspace/`, stdio: 'inherit'});
    else
 		eb = spawn('python3', ['-u', `${__dirname}/edgebridge/edgebridge.py`], { cwd: `${__dirname}/workspace/`, stdio: 'inherit'});
}

// Query Ensto-E API directly to get the daily spot prices
async function get_prices() {

    // Get API key from the file "apikey"
    const api_key = fs.readFileSync('./workspace/apikey', 'utf8').trim();

    // The date is determined from the UTC+1 time because the 24-hour API price period is from 23:00 yesterday to 23:00 today
    const hour_ahead_utc = new Date(new Date().setTime(new Date().getTime() + (60*60*1000)));
    let period_start = `${hour_ahead_utc.toISOString().replace(/[-:T.]/g, '').slice(0, 8)}`+`0000`;
    let period_end = `${hour_ahead_utc.toISOString().replace(/[-:T.]/g, '').slice(0, 8)}`+`2300`;

    // Set additional compulsory strings for the API call
    let document_type = `A44`;
    let process_type = `A01`;
    let location_id = `10YFI-1--------U`;

    // Send API get request and parse the received xml into json
    let request = `https://web-api.tp.entsoe.eu/api?securityToken=${api_key}&documentType=${document_type}&processType=${process_type}` +
        `&in_Domain=${location_id}&out_Domain=${location_id}&periodStart=${period_start}&periodEnd=${period_end}`
    const response = await fetch(request).catch(error => console.log(error));
    const json_data = new XMLParser().parse(await response.text());

    // Get price information from the parsed json into the returned prices array
    let prices = [];
    try{
        json_data.Publication_MarketDocument.TimeSeries.Period.Point.forEach(function (entry) {
            prices.push(parseFloat(entry['price.amount']));
        });
    }catch{
        if(`html` in json_data && `body` in json_data.html)
            console.log(`[ERROR] Entso-E API: "${json_data.html.body}" (${new Date().toLocaleString('en-GB')})`);
        else
            console.log(`[ERROR] Cannot parse Entso-E API response! (${new Date().toLocaleString('en-GB')})`);
    }
    
    return prices;
}

// Control heating by sending a POST request to edgebridge
async function adjust_heat() {

    // Get daily spot prices
    const prices = await get_prices();

    // Define function for sending a post request to edgebridge
    const post_trigger = async function (device) {
        console.log(`[REQUEST] Sending ${device} POST request to edgebridge! (${new Date().toLocaleString('en-GB')})`);
        const response = await fetch(`http://${ip.address()}:8088/${device}/trigger`, {method: 'POST'}).catch(error => console.log(error));
    }

    // The index maps to the ceiling of the current UTC hour (0 for 23-00, 1 for 00-01, 2 for 01-02)
    const index = parseInt(new Date(new Date().setTime(new Date().getTime() + (60*60*1000))).getUTCHours());

    // Send HeatOff request if one of 8 most costly hours of the day and the hourly price is over 4cnt/kWh, else HeatOn
    if (prices[index] > quantile(prices, 0.67) && prices[index] > 40)
        await post_trigger("HeatOff");
    else 
        await post_trigger("HeatOn");

    // Debugging prints
    if(DEBUG){
        console.log(`[DEBUG] price[${index - 1}]: ${prices[index]}, quantile(prices, 0.67): ${quantile(prices, 0.67)} ` +
            `(${new Date().toISOString().replace(/[T]/g, ' ').slice(0, 19) + " UTC"})`);
        console.log(prices);
    }
}

// Begin execution here
(async () => {
    // Check conflicting processes and exit if found
    await check_procs().catch(error => process.exit());

    // Start edgebridge as a child process
    run_edgebridge();

    // Control heating with set schedule
    if(DEBUG)
        setInterval(adjust_heat, 3000);
    else
        schedule.scheduleJob('0 * * * *', adjust_heat);
})();
