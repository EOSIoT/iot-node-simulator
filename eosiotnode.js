/*
MIT License

Copyright(c) 2018 Evan Ross, 2018 EOSIoT, 2020 Measurement Earth

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files(the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions :

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
* \file
*         This node.js application simulates the activity of many IoT nodes
*         submitting data to a smart contract (dApp) on an eosio-software-based blockchain.
 *        
 *        There are a couple of key design principles that must be understood.
 *        A standard eosjs API access will first reach out to the API endpoint and
 *        perform a fetch of the current blockchain information for "TAPoS":
 *        namely the head block hash and time.  This step places too high
 *        a burden on many kinds of IoT devices, especially if a secure socket
 *        session needs to be setup to do this.
 *        
 *        This simulator functions like a real IoT device: it pulls TAPoS info
 *        *one time* and builds and sends transactions *without* fetching new TAPoS
 *        each time.  TAPoS is valid for a period of time and only periodic
 *        updates are necessary.  For this simulation, the TAPoS data is fetched once
 *        and never again.  Significant bandwidth savings are realized and the API endpoint 
 *        operators are no doubt thankful for that.
 *        
 *        This simulation puts real transactions to a real dApp.  Most of the CPU and net bandwidth
 *        are charged to the account assigned to each node. The dApp itself, though, must have sufficient resources
 *        staked to facilitate the flow of data from X number of nodes (whatever X is set to). 
 *        This can be quite a bit :)  For lesser used blockchains with oodles of spare resources,
 *        ten bucks can buy you access for many thousands of devices. Even better, the testnets
 *        give away resources and it costs almost nothing to load them up for testing.
*
* \author
*         Evan Ross <contact@firmwaremodules.com>
*/


const { Api, JsonRpc, RpcError } = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');      
const fetch = require('node-fetch');                                    
const { TextEncoder, TextDecoder } = require('util');                   
const crypto = require("crypto");

/* Simulation Parameters 
 * ------------------------
 * 
 *  NUM_NODES  - number of simultaneous nodes to simulate.
 *  PERIOD_SEC - period of time between simulated node data transmissions.
 *  POOL_SIZE_MAX - maximum number of API endpoints to discover and put into the pool
 *  TAPOS_EXPIRY_S - expiry time to use in transaction headers.
 */
const NUM_NODES         = 1000;
const PERIOD_SEC        = 600;
const POOL_SIZE_MAX     = 21;
const TAPOS_EXPIRY_S    = 3600;

const USE_EOS_MAINNET = 0;
const USE_TELOS_MAINNET = 1;
const USE_JUNGLE_TESTNET = 0;

/* Enable to populate the API pool with the bootstrap endpoints
 * rather than discover them automatically.
 */
const USE_BOOTSTRAP_ENDPOINTS = 1;

/* Support for different eosio blockchains is provided.  Each blockchain
 * is differentiated by its unique chain id and list of bootstrap API access points.
 * The boostrap access points are polled in order until a list of block producers is obtained.
 * From this list, an attempt is made to obtain the bp.json from each provided URL.  And
 * from the bp.json, the API access point URL is obtained.  From the API access point URL, the
 * chain info is obtained.  If it all works out, that API access point is put into a list and
 * used as the runtime access point pool for the simulation (which is really isn't a simulation
 * as real transactions are put to a real dApp).
 */
const BOOTSTRAP_INFO_EOS_MAINNET = {
    chain_id: "aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906",
    bootstrap_ap_list: [
        "http://eos.eoscafeblock.com",

    ]
};

const BOOTSTRAP_INFO_JUNGLE2_TESTNET = {
    chain_id: "e70aaab8997e1dfce58fbfac80cbbb8fecec7b99cf982a9444273cbc64c41473",
    bootstrap_ap_list: [
        "http://jungle.atticlab.net:8888",
    ]
};

const BOOTSTRAP_INFO_TELOS_MAINNET = {
    chain_id: "4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11",
    bootstrap_ap_list: [
        "http://telos.eoscafeblock.com",
        "http://telos.caleos.io",
        "http://api.eos.miami",
        "http://api.telos.telosgreen.com",
        "http://api.telosmadrid.io",
        "http://telos.cryptosuvi.io"
    ]
};

/* This private key corresponds to public key EOS5vTZaF1iBWfMG4zQjDo8DY98ERomWdw9V4gVJYk6B7u3mZBD5B
 * used ONLY for the "iotsim" permission on the node accounts.
 * See https://telos.bloks.io/account/eosiot11node#keys.
 * This key allows you to run this simulation out-of-the-box using the resources assigned to these accounts
 * without having to create your own.
 * This private key does NOT correspond to any active or owner keys so don't bother trying.
 */ 
const IOTSIM_PERMISSION_KEY = "5Jh8vmcNET9RL1SeUwHCmTADYGpMYYK5NtpJa52RWBejGPZ5fj3";

/* Array of on-chain accounts to be randomly assigned to simulated IoT nodes
 * and to which the network resource usage are charged. 
 */
var node_accounts = [
    //{ name: "<your account>", wifprivkey: "<your key>" }
    { name: "eosiot11node", permission: "iotsim", wifprivkey: IOTSIM_PERMISSION_KEY },
    { name: "eosiot12node", permission: "iotsim", wifprivkey: IOTSIM_PERMISSION_KEY },
    { name: "eosiot13node", permission: "iotsim", wifprivkey: IOTSIM_PERMISSION_KEY },
    { name: "eosiot14node", permission: "iotsim", wifprivkey: IOTSIM_PERMISSION_KEY },
    { name: "eosiot15node", permission: "iotsim", wifprivkey: IOTSIM_PERMISSION_KEY },
];


/* This is the API pool from which we randomly assign to nodes */
var api_url_pool = [];

/* The contract ap contains an rpc and api endpoint to allow limited control of the contract
 * itself
 */
var contract_ap = null;


async function buildTapos(rpc, chain_id) {
    console.log("Build transaction headers...");

    var info = await rpc.get_info({});
    var chainDate = new Date(info.head_block_time + 'Z');
    var expiration = new Date(chainDate.getTime() + TAPOS_EXPIRY_S * 1000);
    var expirationEpoch = Math.floor(expiration.getTime() / 1000);
    expiration = expiration.toISOString().split('.')[0]
    var block = await rpc.get_block(info.last_irreversible_block_num)

    var tapos = {
        chain_id: chain_id,
        expiration: expiration,
        expiration_epoch : expirationEpoch,
        ref_block_num: info.last_irreversible_block_num & 0xFFFF,
        ref_block_prefix: block.ref_block_prefix
    };

    console.log("expiration: " + tapos.expiration + "(" + expirationEpoch + ", " + expirationEpoch.toString(16) + ")");
    console.log("block_num: " + tapos.ref_block_num.toString(16))
    console.log("block_prefix: " + tapos.ref_block_prefix.toString(16))

    return tapos;
}

function buildContractAp(rpc)
{
    /* Contract "reset" method is linked to the iotsim permission */
    const sig = new JsSignatureProvider([IOTSIM_PERMISSION_KEY]);

    const api = new Api({
        rpc: rpc, signatureProvider: sig,
        textDecoder: new TextDecoder(), textEncoder: new TextEncoder(),
    });

    let data = {
        rpc: rpc,
        api: api
    };
    return data;
}

async function buildApiPool(bootstrap_info) {

    /* Compare results to this id */
    let chain_id = bootstrap_info.chain_id;

    let tapos = null;

    /* Try each bootstrap access point */
    for (const bootstrap_url of bootstrap_info.bootstrap_ap_list) {

        /* Setup a local RPC around this bootstrap AP */
        const bootstrap_rpc = new JsonRpc(bootstrap_url, { fetch });

        /* Get the tapos data */
        if (!tapos) {
            tapos = await buildTapos(bootstrap_rpc, chain_id);
        }

        /* Set a global RPC for managing the contract itself */
        if (tapos && !contract_ap) {
            contract_ap = buildContractAp(bootstrap_rpc);
        }

        /* If we've elected to discover the list of API endpoint, do so.
         * Otherwise, copy the bootstrap endpoints directly over to the pool.
         */
        if (USE_BOOTSTRAP_ENDPOINTS) {
            api_url_pool.push(bootstrap_url);
            console.log("pushing '" + bootstrap_url + "' (" + api_url_pool.length + ")");
            if (api_url_pool.length == POOL_SIZE_MAX) {
                return tapos;
            }
        } else {
            /* Discover the list of endpoints from the get_producers API */
            /* Get a list of producers (i.e. system listproducers) */
            const res = await bootstrap_rpc.get_producers();
            for (const row of res.rows) {
                if (row.is_active && row.url !== '') {
                    //console.log(row);
                    console.log("checking: '" + row.owner + "' for bp.json at '" + row.url + "'");
                    try {
                        const res = await fetch(row.url + "/bp.json");
                        const json = await res.json();
                        for (const node of json.nodes) {
                            if (node.api_endpoint) {
                                /* got the API endpoint */
                                //console.log(node.api_endpoint);
                                /* Get the chain info, make sure its valid and up to date  */
                                const bp_rpc = new JsonRpc(node.api_endpoint, { fetch });
                                const json = await bp_rpc.get_info();
                                //console.log(json);
                                if (json.chain_id && json.chain_id === chain_id) {
                                    api_url_pool.push(node.api_endpoint);
                                    console.log("  pushing '" + node.api_endpoint + "' (" + api_url_pool.length + ")");
                                    if (api_url_pool.length == POOL_SIZE_MAX) {
                                        return tapos;
                                    }
                                }
                            }
                        }
                    } catch (e) { console.log(row.url + " check failed."); }
                }
            }

        } // if (USE_BOOTSTRAP_ENDPOINTS)
    }
    return tapos;
}


/* Return random element of the provided array */
function getRandElement(arr)
{
    var i = Math.floor(Math.random() * arr.length);
    return arr[i];
}

/* 
 * Instantiate a node instance and add it to the node list.
 */
async function instantiateNode(id, tapos)
{
 
    const uniqueid = crypto.randomBytes(16).toString("hex");
    const url = getRandElement(api_url_pool);
    const wallet = getRandElement(node_accounts);
    const timeout = Math.round(Math.random() * PERIOD_SEC * 1000)

    const rpc = new JsonRpc(url, { fetch });
    const sig = new JsSignatureProvider([wallet.wifprivkey]);

    const api = new Api({
        rpc: rpc, signatureProvider: sig,
        
        textDecoder: new TextDecoder(), textEncoder: new TextEncoder(),
        // Specify chainId to eliminate a "get_info" RPC fetch
        // Also need to add the TAPoS fields to the transaction.
        // Note chainId is not used anywhere in the formation or signing of a transaction.
        chainId: tapos.chain_id
    });

    //console.log(api);
    /* Random start times require that each node gets a random start
     * time assigned within the PERIOD with setTimeout.
     * When that timer expires, it gets a setInterval setup for the PERIOD.
     */ 

    var node = {
        tapos: tapos,
        api: api,
        id: id,
        uniqueid: uniqueid,
        endpoint: url,
        account: wallet.name,
        permission: wallet.permission,
        tx_count : 0,
        init: true, /* waiting for initial timeout to expire before transition to interval */
    };

    /* Set a random initial timeout before running
     * the node for the first time
     */
    setTimeout(runNode, timeout, node)

    console.log("instantiate node " + id + ", endpoint:" + node.endpoint +
        ", account:" + node.account + ", starting in: " + timeout/1000 + " seconds.");
    //console.log(node);
}



async function main() {

    var tapos = null;

    console.log("Building API endpoint pool...");
    if (USE_EOS_MAINNET) {
        tapos = await buildApiPool(BOOTSTRAP_INFO_EOS_MAINNET);
    } else if (USE_TELOS_MAINNET) {
        tapos = await buildApiPool(BOOTSTRAP_INFO_TELOS_MAINNET);
    } else if (USE_JUNGLE_TESTNET) {
        tapos = await buildApiPool(BOOTSTRAP_INFO_JUNGLE2_TESTNET);
    }

    /* Reset the stress contract */
    await reset();

    if (tapos) {
        console.log("Instantiating " + NUM_NODES + " nodes...");
        for (var i = 0; i < NUM_NODES; i++) {
            try {
                await instantiateNode(i, tapos);
            } catch (e) {
                console.log("error instantiating node " + i + ", is the wallet valid?");
            }
        }
    }
}


main();



////////////////////////////////////////////////////

function print(msg) {
    process.stdout.write(msg);
}

const CONSOLE = true;

if (CONSOLE) {

    function menu() {
        print("> ");
    }

    menu();
    const readline = require('readline');
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') {
            print("Exiting.");
            process.exit();
        } else {
            switch (key.name) {
                case 'x':
                    break;
                case 'r':
                    reset();
                    break;
                case 'p':
                    printResults();
                    break;
                
            }
            print(`You pressed the "${str}" key\r\n`);
        }
        menu();
    });
}

/*
 * Node timer callback. 
 * 
 * A node is assigned a wallet (signatureProvider)
 * and a fixed API endpoint.
 */
function runNode(node)
{
    /* Get current time of formation of this transaction.
     * This time is compared to the current block time to estimate latency.
     * The block time is in units of seconds (uint32) so we do the same here.
     */
    var nowTimeSecUTC = Math.floor(new Date().getTime() / 1000);
    var expiry = node.tapos.expiration_epoch - nowTimeSecUTC;
    //console.log(nowTimeSecUTC, node.tapos.expiration_epoch);

    var name = node.account;
    node.tx_count++;
    console.log("running node " + node.id + " " + name + " (tx:"+node.tx_count+") expire in " + expiry + " s");
    if (node.init) {
        /* One time only set the periodic uplink interval */
        console.log("   set interval.");
        setInterval(runNode, PERIOD_SEC * 1000, node);
        node.init = false;
    }

    /* Submit data to the account hosting the contract
     * on behalf of the node account.  The node's account
     * is what is charged for the resources used to send this "data".
     */
    var transaction =
    {
        expiration: node.tapos.expiration,
        ref_block_num: node.tapos.ref_block_num,
        ref_block_prefix: node.tapos.ref_block_prefix,
        actions: [
            {
                account: 'eosiotstress',
                name: 'submit',
                authorization: [{
                    actor: name,
                    permission: node.permission
                }],
                data: {
                    user: name,
                    unique_id: node.uniqueid,
                    node_time: nowTimeSecUTC,
                    memo: "eosiot.io network stress test"
                }
            }
        ]
    };            

    /* issue transaction non-blocking */
    node.api.transact(transaction);
}


/* Reset the simulator stress contract */
async function reset() {

    console.log("Resetting contract...");

    var transaction =
    {
        actions: [
            {
                account: 'eosiotstress',
                name: 'restart',
                authorization: [{
                    actor: "eosiot11node",
                    permission: "iotsim"
                }],
                data: {
                    node: 'eosiot11node'
                }
            }
        ]
    };

    /* issue transaction non-blocking */
    const res = await contract_ap.api.transact(transaction, {
        blocksBehind: 3,
        expireSeconds: 30,
    });
    console.log("Contract reset.", res);
}

async function printResults() {
    console.log("Getting simulation results...");
    const resp = await contract_ap.rpc.get_table_rows({
        json: true,                 // Get the response as json
        code: 'eosiotstress',           // Contract that we target
        scope: 'eosiotstress',           // Account that owns the data
        table: 'statetable',           // Table name
        limit: 1,                   // Here we limit to 1 to get only the
        reverse : false,            // Optional: Get reversed data
        show_payer : false,         // Optional: Show ram payer
    });
    console.log(resp.rows);
}


