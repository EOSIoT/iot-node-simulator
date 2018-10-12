# IoT Node Simulator for the EOS Blockchain

Simulates multiple IoT nodes submitting data to the EOS blockchain.  Intended to be used with the [node simulator contract](https://github.com/EOSIoT/iot-node-simulator-contract).

This simulator can simulate up to 1000 IoT nodes.  The simulation parameters consist of:
* Data reporting interval (seconds), e.g. 600.
* Number of nodes, e.g. 1000
* Account pool, e.g. {name, WIF privkey}

Upon instantiation, each node is randomly assigned an API access point from amongst the 21 block producers; given a periodic data reporting time randomly selected from within the specified reporting interval; and assigned the private key of an account on the EOS blockchain, randomly selected from the account pool, from which to sign data transactions.

Thus, the simulation can be run from a single EOS account.  However to experiment with the effect that account parallelism may have on transaction throughput, a pool of accounts can be used.

### Expected Results

Let's take 1000 nodes, transmitting and transacting on 10 minute sample intervals.  On average these nodes would generate 1.7 transactions per second on the EOS blockchain.  If we put that in a Poisson distribution, even 5 TX/s is low probability and 10 TX/s is vanishingly small.  That's for 1000 nodes.

If we can get 1,000,000 nodes deployed, we would be looking at on average 1700 TX/s loading on the EOS mainnet.  To simulate that, we would like to get 1000 instances of this node simulator running at the same time around the world.







