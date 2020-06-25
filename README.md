## IoT Node Simulator for EOSIO Blockchains

This simulator software puts **real** transactions from multiple simulated IoT sensor devices to a selected EOSIO blockchain. 

The goal of this simulation is to understand the actual performance of an EOSIO blockchain when ingesting and distributing data
from potentially thousands or millions of IoT devices, and specifically for the **Measurement Earth Global Open Data Platform**
https://measurement.earth

This simulator has been designed to support the [TELOS](https://www.telos.net/) blockchain out of the box.  The TELOS chain has a number of attractive
features including demonstrated stability, a transparent governance model, and plentiful resources at a resonable cost.

### Simulation Setup

The simulation is initially configured for 1000 IoT devices submitting data at 10 minute intervals.  10 minutes is a relatively high
rate of reporting for what I envision, but it starts to move the needle and makes this testing more interesting.
On average we are expecting to see about 1.7 transactions per second from this load.

The number of IoT nodes and frequency of transmission are configurable.
These constants may be adjusted to suit your requirements:

```
const NUM_NODES     = 1000;
const PERIOD_SEC    = 600;
```

The simulation comes with a pool of 5 node accounts.  These accounts are already setup on the TELOS chain and have 
the necessary permissions encoded in the script to push transactions to the simulation dApp, allowing anyone to run
this software.  
With this configuration, the load from 1000 nodes is distributed over the resources assigned to the 5 accounts:

* https://telos.bloks.io/account/eosiot11node
* https://telos.bloks.io/account/eosiot12node
* https://telos.bloks.io/account/eosiot13node
* https://telos.bloks.io/account/eosiot14node
* https://telos.bloks.io/account/eosiot15node

### Simulation Operation

The simulation is hands-off, and once started it will run until TaPoS expires (set to 1 hour by default) or one or more of the API
access points start second guessing this data flow.  It is one thing to theoretically predict transaction volume handling and quite another
to actually put that transaction volume onto a chain in the real world.  Things like actual network performance, latencies, packet loss, 
arcane EOSIO server and software performance glitches come into play and that is what makes this simulation tool so valuable.


Upon instantiation, each node is:

* Randomly assigned an API access point from amongst a selected pool of RPC API endpoints whose URLs are encoded in the script;
* Given a periodic data reporting time randomly selected from within the specified reporting interval; 
* Assigned the private key of an account permission on the EOSIO blockchain, randomly selected from the account pool, from which to sign data transactions.

Thus, the simulation can be run from a single EOSIO account.  However, to experiment with the effect that account parallelism may have on transaction throughput, a pool of accounts is used.

The script also has an RPC API access point discovery mode to dynamically generate a pool of RPC API access points that
nodes are assigned to (this feature is disabled by default and a fixed pool is used).

As the simulation runs, you can press the `p` key to grab the current state of the dApp's state table:

```
Getting simulation results...
You pressed the "p" key
> [
  {
    host: 'eosiotstress',
    lifetime_resets: 16,
    latency_stats: {
      min: '0.00000000000000000',
      max: '36.00000000000000000',
      var: '0.00000000000000000',
      mean: '4.52800000000000047'
    },
    tps_stats: {
      min: '1.06250000000000000',
      max: '5.40000000000000036',
      var: '0.00000000000000000',
      mean: '2.08195121621372303'
    },
    num_transactions: 250,
    time_first_tx_s: 1593053437,
    time_last_tx_s: 1593053574
  }
]
```

Here you will see that after 250 transactions (this is from an ongoing simulation) the mean TPS was 2.08, tending toward the expected mean of 1.7.

Alternatively you can view the state on a [block explorer](https://telos.bloks.io/account/eosiotstress?loadContract=true&tab=Tables&account=eosiotstress&scope=eosiotstress&limit=100&table=statetable)

After 559 transactions, the mean TPS was getting closer to 1.7.  The latency statistics show that the average delay in processing a transaction was about 4 seconds, with a maximum of 36 seconds.

```
[
  {
    host: 'eosiotstress',
    lifetime_resets: 16,
    latency_stats: {
      min: '0.00000000000000000',
      max: '36.00000000000000000',
      var: '0.00000000000000000',
      mean: '4.19856887298748482'
    },
    tps_stats: {
      min: '1.06250000000000000',
      max: '5.40000000000000036',
      var: '0.00000000000000000',
      mean: '1.91504919581320343'
    },
    num_transactions: 559,
    time_first_tx_s: 1593053437,
    time_last_tx_s: 1593053745
  }
]
```

Lastly, after 1693 transactions, a TPS mean of 1.78 was observed.

```
[
  {
    host: 'eosiotstress',
    lifetime_resets: 16,
    latency_stats: {
      min: '0.00000000000000000',
      max: '36.00000000000000000',
      var: '0.00000000000000000',
      mean: '5.09214412285883089'
    },
    tps_stats: {
      min: '1.06250000000000000',
      max: '5.40000000000000036',
      var: '0.00000000000000000',
      mean: '1.77898204588052233'
    },
    num_transactions: 1693,
    time_first_tx_s: 1593053437,
    time_last_tx_s: 1593054429
  }
]
```

### Simulation dApp

The IoT node simulation software sends transactions to a smart contract (dApp) loaded on the [eosiotstress](https://telos.bloks.io/account/eosiotstress)
account.  You will see the transactions for all nodes in the blocks.io transaction log.

The source code for the dApp is at this [repository](https://github.com/EOSIoT/iot-node-simulator-contract).


### Expected Results

For 1000 nodes, transmitting and transacting on 10 minute sample intervals, we expect on average these nodes would generate about 1.7 transactions per second on an EOSIO blockchain.  
If we put that in a [Poisson distribution](https://en.wikipedia.org/wiki/Poisson_distribution), even 5 TX/s is low probability and 10 TX/s is vanishingly small. And that is for 1000 nodes.

If we look at a more conservative 30 minute interval, we get about 0.56 TX/s, and for 60 minutes it is 0.28 TX/s for 1000 nodes.

For 1 million nodes, reporting at 10 minute intervals, we should be looking at an average transaction load of 1700 TX/s.  To simulate that, we could look to get 1000 instances of this node simulator running at the same time around the world. 
This would seem to be a worthwhile project, although the logistics of finding and coordinating 1000 independent deployment hosts or containers could be a challenge. 
I'm open to ideas.








