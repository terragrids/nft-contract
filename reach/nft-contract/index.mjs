/* eslint-disable no-console */
import { loadStdlib } from '@reach-sh/stdlib'
import assert from 'assert'
import * as backend from './build/index.main.mjs'

// Load Reach stdlib
const stdlib = loadStdlib()
if (stdlib.connector !== 'ALGO') {
    throw Error('stdlib.connector must be ALGO')
}

// Define utility functions
export class Signal {
    constructor() {
        const me = this
        this.p = new Promise(resolve => {
            me.r = resolve
        })
    }
    wait() {
        return this.p
    }
    notify() {
        this.r(true)
    }
}

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))
const thread = async f => await f()
const threadWithDelay = async (f, ms) => {
    await timeout(ms)
    await f()
}

const algo = x => stdlib.formatCurrency(x, 4)
const fmt = x => `${algo(x)} ALGO`
const fmtToken = (x, token) => `${x} ${token.sym}`
const tokenPrice = 10

const getBalances = async (who, token) => {
    return await stdlib.balancesOf(who, [null, token.id])
}

const callAPI = async (name, f, successMsg, failureMsg, retries = 0) => {
    await timeout(10 * Math.random())

    async function call() {
        let result
        try {
            console.log(`${name} is calling the API`)
            result = await f()
            console.log(successMsg)
        } catch (e) {
            console.log(failureMsg)
            if (retries > 0) {
                retries--
                console.log('retrying...')
                await timeout(1000)
                result = await call()
            }
        }
        return result
    }

    return await call()
}

const setup = async () => {
    const startingBalance = stdlib.parseCurrency(100)

    // Create test accounts
    const accAdmin = await stdlib.newTestAccount(startingBalance)
    const accAlice = await stdlib.newTestAccount(startingBalance)
    const accBob = await stdlib.newTestAccount(startingBalance)

    // Launch token
    const gil = await stdlib.launchToken(accAdmin, 'gil', 'GIL', { supply: 1, decimals: 0 })

    // Opt-in to accept the token on ALGO
    await accAlice.tokenAccept(gil.id)
    await accBob.tokenAccept(gil.id)

    return [accAdmin, accAlice, accBob, gil]
}

const getAndLogAllBalances = async (accAdmin, accAlice, accBob, gil) => {
    const [adminAlgo, adminGil] = await getBalances(accAdmin, gil)
    const [aliceAlgo, aliceGil] = await getBalances(accAlice, gil)
    const [bobAlgo, bobGil] = await getBalances(accBob, gil)

    console.log(`Admin has ${fmt(adminAlgo)}`)
    console.log(`Admin has ${fmtToken(adminGil, gil)}`)

    console.log(`Alice has ${fmt(aliceAlgo)}`)
    console.log(`Alice has ${fmtToken(aliceGil, gil)}`)

    console.log(`Bob has ${fmt(bobAlgo)}`)
    console.log(`Bob has ${fmtToken(bobGil, gil)}`)

    return [algo(adminAlgo), adminGil, algo(aliceAlgo), aliceGil, algo(bobAlgo), bobGil]
}

const userConnectAndBuy = async (name, account, contract, gil, ready) => {
    return async () => {
        console.log(`${name} is attaching to the contract...`)
        const ctc = account.contract(backend, contract.getInfo())
        const market = ctc.a.Market
        const view = ctc.v.View

        const [algo1, gil1] = await getBalances(account, gil)

        console.log(`${name} has ${fmt(algo1)}`)
        console.log(`${name} has ${fmtToken(gil1, gil)}`)

        await ready.wait()

        const token = (await view.token())[1].toNumber()

        console.log(`${name} is trying to buy the token with ID ${token}`)

        await callAPI(name, () => market.buy(), `${name} managed to buy the token`, `${name} failed to buy the token, because it is not on the market anymore`)

        const [algo2, gil2] = await getBalances(account, gil)

        console.log(`${name} has ${fmt(algo2)}`)
        console.log(`${name} has ${fmtToken(gil2, gil)}`)
    }
}

const userConnectAndStop = async (name, account, contract, gil, ready) => {
    return async () => {
        console.log(`${name} is attaching to the contract...`)
        const ctc = account.contract(backend, contract.getInfo())
        const market = ctc.a.Market

        const [algo1, gil1] = await getBalances(account, gil)

        console.log(`${name} has ${fmt(algo1)}`)
        console.log(`${name} has ${fmtToken(gil1, gil)}`)

        await ready.wait()

        console.log(`${name} is trying to stop the contract...`)

        await callAPI(name, () => market.stop(), `${name} managed to stop the contract`, `${name} failed to stop the contract`)
    }
}

const testSellAndBuyAndStop = async () => {
    console.log('\n>> Test sell, buy and stop')

    const [accAdmin, accAlice, accBob, gil] = await setup()
    const ready = new Signal()
    const sold = new Signal()

    await getAndLogAllBalances(accAdmin, accAlice, accBob, gil)

    console.log('Deploying the Token Market contract...')

    // Deploy the token market backend
    const ctcTokenMarket = accAdmin.contract(backend)

    await Promise.all([
        thread(await userConnectAndBuy('Alice', accAlice, ctcTokenMarket, gil, ready)),
        thread(await userConnectAndBuy('Bob', accBob, ctcTokenMarket, gil, ready)),
        backend.Admin(ctcTokenMarket, {
            log: (...args) => {
                console.log(...args)
            },
            onReady: async contract => {
                console.log(`Token Market Contract deployed ${JSON.stringify(contract)}`)
                const [adminAlgo, adminGil] = await getBalances(accAdmin, gil)
                assert(adminGil == 0)
                console.log(`Admin has ${fmt(adminAlgo)}`)
                console.log(`Admin has ${fmtToken(adminGil, gil)}`)
                ready.notify()
            },
            onSoldOrWithdrawn: async () => {
                sold.notify()
            },
            token: gil.id,
            price: stdlib.parseCurrency(tokenPrice),
            wallet: accAdmin.networkAccount.addr
        })
    ])

    console.log('Token Market Contract stopped.')

    const [adminAlgo, adminGil, aliceAlgo, aliceGil, bobAlgo, bobGil] = await getAndLogAllBalances(accAdmin, accAlice, accBob, gil)

    assert(adminGil == 0)
    assert(parseFloat(adminAlgo) > 100)
    assert((aliceGil == 1 && bobGil == 0) || (aliceGil == 0 && bobGil == 1))
    assert((parseFloat(aliceAlgo) < 90 && parseFloat(bobAlgo) > 90) || (parseFloat(bobAlgo) < 90 && parseFloat(aliceAlgo) > 90))
}

const testSellAndStop = async () => {
    console.log('\n>> Test sell and stop')
    const [accAdmin, accAlice, accBob, gil] = await setup()
    const ready = new Signal()
    const withdrawn = new Signal()

    await getAndLogAllBalances(accAdmin, accAlice, accBob, gil)

    console.log('Deploying the Token Market contract...')

    // Deploy the token market backend
    const ctcTokenMarket = accAdmin.contract(backend)

    await Promise.all([
        thread(await userConnectAndStop('Admin', accAdmin, ctcTokenMarket, gil, ready)),
        backend.Admin(ctcTokenMarket, {
            log: (...args) => {
                console.log(...args)
            },
            onReady: async contract => {
                console.log(`Token Market Contract deployed ${JSON.stringify(contract)}`)
                const [adminAlgo, adminGil] = await getBalances(accAdmin, gil)
                assert(adminGil == 0)
                console.log(`Admin has ${fmt(adminAlgo)}`)
                console.log(`Admin has ${fmtToken(adminGil, gil)}`)

                ready.notify()
            },
            onSoldOrWithdrawn: async () => {
                withdrawn.notify()
            },
            token: gil.id,
            price: stdlib.parseCurrency(10),
            wallet: accAdmin.networkAccount.addr
        })
    ])

    await withdrawn.wait()

    console.log('Token Market Contract stopped.')

    const [adminAlgo, adminGil, aliceAlgo, aliceGil, bobAlgo, bobGil] = await getAndLogAllBalances(accAdmin, accAlice, accBob, gil)

    assert(adminGil == 1)
    assert(parseFloat(adminAlgo) > 99)
    assert(aliceGil == 0 && bobGil == 0)
    assert(parseFloat(aliceAlgo) > 99 && parseFloat(bobAlgo) > 99)
}

const testSellAndNonAdminStopAndBuy = async () => {
    console.log('\n>> Test sell and non-admin stop and buy')

    const [accAdmin, accAlice, accBob, gil] = await setup()
    const ready = new Signal()
    const sold = new Signal()

    await getAndLogAllBalances(accAdmin, accAlice, accBob, gil)

    console.log('Deploying the Token Market contract...')

    // Deploy the token market backend
    const ctcTokenMarket = accAdmin.contract(backend)

    await Promise.all([
        thread(await userConnectAndStop('Bob', accBob, ctcTokenMarket, gil, ready)),
        threadWithDelay(await userConnectAndBuy('Alice', accAlice, ctcTokenMarket, gil, ready), 10),
        thread(await userConnectAndStop('Admin', accAdmin, ctcTokenMarket, gil, sold)),
        backend.Admin(ctcTokenMarket, {
            log: (...args) => {
                console.log(...args)
            },
            onReady: async contract => {
                console.log(`Token Market Contract deployed ${JSON.stringify(contract)}`)
                const [adminAlgo, adminGil] = await getBalances(accAdmin, gil)
                assert(adminGil == 0)
                console.log(`Admin has ${fmt(adminAlgo)}`)
                console.log(`Admin has ${fmtToken(adminGil, gil)}`)

                ready.notify()
            },
            onSoldOrWithdrawn: async () => {
                sold.notify()
            },
            token: gil.id,
            price: stdlib.parseCurrency(10),
            wallet: accAdmin.networkAccount.addr
        })
    ])

    console.log('Token Market Contract stopped.')

    const [adminAlgo, adminGil, aliceAlgo, aliceGil, bobAlgo, bobGil] = await getAndLogAllBalances(accAdmin, accAlice, accBob, gil)

    assert(adminGil == 0)
    assert(parseFloat(adminAlgo) > 100)
    assert(aliceGil == 1 && bobGil == 0)
    assert(parseFloat(aliceAlgo) < 99 && parseFloat(bobAlgo) > 99)
}

await testSellAndBuyAndStop()
await testSellAndStop()
await testSellAndNonAdminStopAndBuy()
