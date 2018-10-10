/*
MIT License

Copyright(c) 2018 Evan Ross

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
*         submitting data to a smart contract on the EOS blockchain.
*
* \author
*         Evan Ross <contact@firmwaremodules.com>
*/

Eos = require('eosjs')
const crypto = require("crypto");

/* Simulation Parameters 
 * ------------------------
 * 
 *  NUM_NODES  - number of simultaneous nodes to simulate.
 *  PERIOD_SEC - period of time between simulated node data transmissions.
 */
const NUM_NODES = 100;
const PERIOD_SEC = 10;

/* Connect to mainnet or a local test net.
 * Differences include: testnet doesn't support list of block producers
 */
//const USE_MAINNET = false;
const USE_MAINNET = true;

//const API_URL = 'http://localhost:8888';
//const API_URL = 'http://mainnet.eoscalgary.io';
const API_URL = 'http://jungle.cryptolions.io:18888'

/* Array of strings of URLs to be randomly assigned to nodes */ 
var APIEndpoints = [];

/* Array of EOS accounts to be randomly assigned to nodes */
var wallets = [
    { name : "<your account>", wifprivkey : "<your key>" } // jungle
];

/* Node attributes:
 *   - EOS API endpoint URL
 *   - Tx signing wallet
 *   - Instance unique ID, generated from 
*/
var nodes = [];

/* Return random element of the provided array */
function rand(arr)
{
    var i = Math.floor(Math.random() * arr.length);
    return arr[i];
}


/* 
 * Instantiate a node instance and add it to the node list.
 */
function instantiateNode(id)
{
    const uniqueid = crypto.randomBytes(16).toString("hex");
    const endpoint = rand(APIEndpoints)
    const wallet = rand(wallets)
    const timeout = Math.round(Math.random() * PERIOD_SEC * 1000)

    /* Random start times require that each node gets a random start
     * time assigned within the PERIOD with setTimeout.
     * When that timer expires, it gets a setInterval setup for the PERIOD.
     */ 

    var node = {
        id : id,
        uniqueid : uniqueid,
        endpoint : endpoint,
        wallet : wallet,
        init : true, /* waiting for initial timeout to expire before transition to interval */
        requiredKeys : function getRequiredKeys(tx) {
            console.log("get required key: " + wallet.wifprivkey)
            return wallet.wifprivkey
        }
    }

    setTimeout(runNode, timeout, node)

    console.log("instantiate node " + id + ", starting in: " + timeout/1000 + " seconds.");
    console.log(node);

    nodes.push(node);
}




// EOS instance configuration
config = {

  // http://mainnet.eoscalgary.io/v1/chain/get_info
  // The chainId is a hash of genesis.json and remains the same for a given testnet configuration
  // Use cleos get info
  // Parameters for the mainnet
  //chainId: "aca376f206b8fc256ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906", // Mainnet
  chainId : "038f4b0fc8ff18a4f0842a8f0564611f6e96e8535901dd45e43ac8691a1c4dca", // Jungle Test net
  //chainId: "cf057bbfb72640471fd910bcb67639c22df9f92470936cddc1ade0e2f2e7dc4f", // local test net

  httpEndpoint: API_URL,
  expireInSeconds: 60,
  broadcast: true,
  verbose: false, // API activity
  sign: true,
  transactionHeaders: prepareHeaders  //(expireInSeconds, callback) => {callback(null/*error*/, headers)} 
}

eos = Eos(config)

/* 
 * Generate pool of block producer API endpoints to randomly
 * select from.
 */
async function genAPIEndpoints()
{
    if (!USE_MAINNET) {
        APIEndpoints.push(API_URL)
        return
    }
    //cleos system listproducers -l 100
    // /v1/chain/get_producers
    prod = await eos.getProducers({"limit": 21, "json" : true})
    console.log(prod);

    // prod structure:
/*
 { rows:
   [ { owner: 'eosnewyorkio',
       total_votes: '495235452046628992.00000000000000000',
       producer_key: 'EOS6GVX8eUqC1gN1293B3ivCNbifbr1BT6gzTFaQBXzWH9QNKVM4X',
       is_active: 1,
       url: 'https://bp.eosnewyork.io',
       unpaid_blocks: 360,
       last_claim_time: '1538856938500000',
       location: 184 },
*/
    for (var i = 0; i < prod.rows.length; i++) {
        var bp = prod.rows[i]
        if (bp.url == undefined || bp.url == '') {continue}
        APIEndpoints.push(bp.url)
    }

    console.log(APIEndpoints);
}

var transactionHeaders = {}

/* ======== prepareHeaders ==========
 *
 * Callback invoked to return the static headers when creating simulated
 * node transactions.  The static header includes the block num and reference which
 * is aquired at startup.  The expiry date is assigned a short time in the future from
 * this instance in time.
 */
function prepareHeaders(expireInSeconds, callback)
{
    console.log("preparing headers...")
    /* Use UTC time as of now as the reference point rather
     * than getting the head block time which is just going to be approximately 'now' anyways.
     */
    nowDate = new Date()
    expireDate = new Date(nowDate.getTime() + (60 * 1000))
    expiration = expireDate.toISOString().split('.')[0] /* drop the milliseconds for EOS format */
    transactionHeaders.expiration = expiration
    console.log("  expiration = " + transactionHeaders.expiration)
    callback(null, transactionHeaders)
}


// Wrap in async to use 'await' operation
async function main() {

    console.log("Build transaction headers...")

    /* Construct static transaction headers to be used with simulated node
     * transactions.  Our real nodes will not make API requests to the blockchain
     * to get block info for each transaction.
     */
    info = await eos.getInfo({})
    chainDate = new Date(info.head_block_time + 'Z')
    expiration = new Date(chainDate.getTime() + 60 * 1000)
    expiration = expiration.toISOString().split('.')[0]
    block = await eos.getBlock(info.last_irreversible_block_num)

    transactionHeaders = {
        expiration,
        ref_block_num: info.last_irreversible_block_num & 0xFFFF,
        ref_block_prefix: block.ref_block_prefix
    }

    nowDate = new Date()
    console.log(nowDate);
    console.log(nowDate.toISOString());
    console.log("set tx headers:")
    console.log("expiration: " + transactionHeaders.expiration)
    console.log("block_num: " + transactionHeaders.ref_block_num)
    console.log("block_prefix: " + transactionHeaders.ref_block_prefix)

    console.log("Generating API endpoints...");
    await genAPIEndpoints()

    console.log("Instantiating " + NUM_NODES + " nodes...");
    for (var i = 0; i < NUM_NODES; i++) {
        instantiateNode(i);
    }   
}

function keyProvider(arg1, arg2, arg3)
{
    console.log("Keyprovider");
    console.log(arg1)
    console.log(arg2)
    console.log(arg3)
}


/*
 * Node timer callback. 
 */
function runNode(node)
{
    console.log("running node " + node.id);
    if (node.init) {
        console.log("   set interval.");
        setInterval(runNode, PERIOD_SEC * 1000, node)
        node.init = false;
    }

    var name = node.wallet.name;
    console.log(name)

    /* Get current time of formation of this transaction.
     * This time is compared to the current block time to estimate latency.
     * The block time is in units of seconds (uint32) so we do the same here.
     */
    nowTimeSec = Math.floor(new Date().getTime() / 1000)
    console.log(nowTimeSec)

    /* Submit data */
    var transaction = 
        {
            actions : [
                {
                    account : 'eosiotstress',
                    name : 'submit',
                    authorization : [{
                        actor: name,
                        permission : 'active'
                    }],
                    data : {
                        user : name,
                        unique_id : node.uniqueid,
                        node_time : nowTimeSec,
                        memo : "eosiot.io network stress test"
                    }
                }
            ]
        }        

    /* issue transaction non-blocking */
    var txresp = eos.transaction(transaction, { keyProvider:
        () => {
            console.log("get required key: " + node.wallet.wifprivkey)
            return node.wallet.wifprivkey
        }})
    console.log(transaction)

/*
    var txresp = await eos.transaction(transaction)
    var fulltx = Object.assign(txresp.transaction.transaction, txresp.transaction.signatures)
    //var fulltx = Object.assign(transactionHeaders, transaction)
    console.log(fulltx)
    buffer = eos.fc.toBuffer('signed_transaction', fulltx)
    console.log(buffer)
*/


}

/* Start! */
main();

