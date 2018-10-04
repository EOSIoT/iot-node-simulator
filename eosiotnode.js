Eos = require('eosjs')




// Default configuration
config = {

// Parameters for the mainnet
  //chainId: "aca376f206b8fc256ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906", // 32 byte (64 char) hex string
  //keyProvider: [''], // WIF string or array of keys..
  //httpEndpoint: 'http://mainnet.eoscalgary.io',

// Parameters for local testnet
// Used these keys for all accounts.  Same key as used on eos.io smart contract tutorials.
//Private key: 5Jmsawgsp1tQ3GD6JyGCwy1dcvqKZgX6ugMVMdjirx85iv5VyPR
//Public key: EOS7ijWCBmoXBi3CgtK7DJxentZZeTkeUnaSDvyro9dq7Sd1C3dC4

// The chainId will change each time the local testnet is launched.
// Use cleos get info
  chainId: "cf057bbfb72640471fd910bcb67639c22df9f92470936cddc1ade0e2f2e7dc4f", // 32 byte (64 char) hex string
  keyProvider: ['5Jmsawgsp1tQ3GD6JyGCwy1dcvqKZgX6ugMVMdjirx85iv5VyPR'], // WIF string or array of keys..
  httpEndpoint: 'http://localhost:8888',

  expireInSeconds: 60 * 60,
  broadcast: true,
  verbose: false, // API activity
  sign: true,

  transactionHeaders: prepareHeaders  //(expireInSeconds, callback) => {callback(null/*error*/, headers)} 
}

eos = Eos(config)

// http://mainnet.eoscalgary.io/v1/chain/get_info


// OFFLINE (bring `transactionHeaders`)

// All keys in keyProvider will sign.
//eos = Eos({httpEndpoint: null, chainId, keyProvider, transactionHeaders})

var transactionHeaders = {}

function prepareHeaders(expireInSeconds, callback)
{
    console.log("preparing headers...")
    /* Use UTC time as of now as the reference point rather
     * than getting the head block time which is just going to be approximately 'now' anyways.
     */
    nowDate = new Date()
    expireDate = new Date(nowDate.getTime() + (30 * 1000))
    expiration = expireDate.toISOString().split('.')[0] /* drop the milliseconds for EOS format */
    transactionHeaders.expiration = expiration
    console.log("  expiration = " + transactionHeaders.expiration)
    callback(null, transactionHeaders)
}


// Wrap in async to use 'await' operation
async function main() {

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

    // Grab a new EOS object configured to use the static transaction headers
    

    //eos.getInfo()
    //info = await eos.getInfo({})
    //console.log(info)
    //await eos.getInfo({}) // @returns {Promise}
    //eos.getInfo((error, result) => { console.log(error, result) })
    //block = await eos.getBlock(info.head_block_num)
    //console.log(block)


    /* Submit data */
    var transaction = 
        {
            actions : [
                {
                    account : 'eosiotstress',
                    name : 'submit',
                    authorization : [{
                        actor: 'node',
                        permission : 'active'
                    }],
                    data : {user : 'node'}
                }
            ]
        }        

    var txresp = await eos.transaction(transaction)

    var fulltx = Object.assign(txresp.transaction.transaction, txresp.transaction.signatures)

    //var fulltx = Object.assign(transactionHeaders, transaction)
    console.log(fulltx)
    buffer = eos.fc.toBuffer('signed_transaction', fulltx)
    console.log(buffer)



}


main();
