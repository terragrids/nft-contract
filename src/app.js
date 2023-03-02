'use strict'

import dotenv from 'dotenv'
import Koa from 'koa'
import Router from '@koa/router'
import errorHandler from './middleware/error-handler.js'
import requestLogger from './middleware/request-logger.js'
import ReachProvider from './provider/reach-provider.js'
import * as backend from '../reach/nft-contract/build/index.main.mjs'
import DynamoDbRepository from './repository/dynamodb.repository.js'
import authHandler from './middleware/auth-handler.js'
import bodyParser from 'koa-bodyparser'
import MissingParameterError from './error/missing-parameter.error.js'
import ParameterTooLongError from './error/parameter-too-long.error.js'
import { UserUnauthorizedError } from './error/user-unauthorized.error.js'
import { algorandAddressFromCID, cidFromAlgorandAddress } from './utils/token-utils.js'
import { getContractFromJsonString, getJsonStringFromContract, truncateString } from './utils/string-utils.js'
import MintTokenError from './error/mint-token.error.js'
import DeployContractError from './error/deploy-contract.error.js'
import { createPromise } from './utils/promise.js'
import NftRepository from './repository/nft.repository.js'
import ParameterNotValidError from './error/parameter-not-valid.error.js'
import AlgoIndexer from './provider/algo-indexer.js'
import NotFoundError from './error/not-found.error.js'
import { isAdminWallet } from './utils/wallet-utils.js'
import AssetOwnershipError from './error/asset-ownership.error.js'
import UpdateAssetStatusError from './error/update-asset-status.error.js'
import ProjectApi from './provider/project-api.js'
import ReadContractError from './error/read-contract.error.js'
import { ProjectNotApprovedError } from './error/project-not-approved.error.js'
import PurchaseAuth from './provider/purchase-auth.js'
import { PurchaseUnauthorizedError } from './error/purchase-unauthorized.error.js'
import { PurchaseAuthorizationAlreadyIssuedError } from './error/purchase-authorization-expired.error.js'
import { projectDepositPercentageOfPrice } from './utils/constants.js'

dotenv.config()
export const app = new Koa()
const router = new Router()

router.get('/', ctx => {
    ctx.body = 'terragrids nft contract api'
})

router.get('/hc', async ctx => {
    const reachProvider = new ReachProvider()

    const stdlib = reachProvider.getStdlib()
    const provider = await stdlib.getProvider()

    const [algoClientHC, algoIndexerHC, algoAccount, dynamoDb] = await Promise.all([
        provider.algodClient.healthCheck().do(), // algo sdk client
        provider.indexer.makeHealthCheck().do(), // algo indexer client
        stdlib.newAccountFromMnemonic(process.env.ALGO_ACCOUNT_MNEMONIC), // reach account handle
        new DynamoDbRepository().testConnection() // DynamoDB client
    ])

    const ok = 'ok'
    const error = 'error'

    ctx.body = {
        env: process.env.ENV,
        region: process.env.AWS_REGION,
        db: {
            status: dynamoDb.status === 200 ? ok : error,
            region: dynamoDb.region
        },
        reach: {
            network: reachProvider.getEnv(),
            algoClient: JSON.stringify(algoClientHC) === '{}' ? ok : error,
            algoIndexer: algoIndexerHC.version ? ok : error,
            algoAccount: algoAccount.networkAccount ? ok : error
        }
    }
})

router.post('/nfts', authHandler, bodyParser(), async ctx => {
    if (!ctx.request.body.name) throw new MissingParameterError('name')
    if (!ctx.request.body.symbol) throw new MissingParameterError('symbol')
    if (!ctx.request.body.price) throw new MissingParameterError('price')
    if (!ctx.request.body.cid) throw new MissingParameterError('cid')
    if (!ctx.request.body.offChainImageUrl) throw new MissingParameterError('offChainImageUrl')

    if (ctx.request.body.name.length > 128) throw new ParameterTooLongError('name')
    if (ctx.request.body.symbol.length > 8) throw new ParameterTooLongError('symbol')
    if (ctx.request.body.offChainImageUrl && ctx.request.body.offChainImageUrl.length > 128) throw new ParameterTooLongError('offChainImageUrl')
    const price = parseInt(ctx.request.body.price)
    if (isNaN(price) || price < 0) throw new ParameterNotValidError('price')
    if (!isAdminWallet(ctx.state.account)) throw new UserUnauthorizedError()

    const symbol = ctx.request.body.symbol.toUpperCase()
    const stdlib = new ReachProvider().getStdlib()
    const algoAccount = await stdlib.newAccountFromMnemonic(process.env.ALGO_ACCOUNT_MNEMONIC)

    /**
     * Mint project token
     */

    let tokenId, managerAddress
    try {
        const cid = ctx.request.body.cid
        const { address, url } = algorandAddressFromCID(stdlib.algosdk, cid)
        const cidFromAddress = cidFromAlgorandAddress(stdlib.algosdk, address)
        if (cid !== cidFromAddress) throw new Error('Error verifying cid')

        managerAddress = algoAccount.networkAccount.addr
        const assetName = truncateString(ctx.request.body.name, 32)

        const token = await stdlib.launchToken(algoAccount, assetName, symbol, {
            supply: 1,
            decimals: 0,
            url,
            reserve: address,
            manager: managerAddress,
            freeze: managerAddress,
            clawback: managerAddress
        })

        tokenId = token.id.toNumber()
    } catch (e) {
        throw new MintTokenError(e)
    }

    /**
     * Deploy project contract
     */

    try {
        const { promise, succeed, fail } = createPromise()

        try {
            const contract = algoAccount.contract(backend)
            contract.p.Admin({
                log: () => {},
                onReady: async contract => {
                    try {
                        const contractId = getJsonStringFromContract(contract)
                        await new NftRepository().createNft({
                            tokenId,
                            symbol,
                            name: ctx.request.body.name,
                            offChainImageUrl: ctx.request.body.offChainImageUrl,
                            creator: ctx.request.body.creator,
                            contractId
                        })
                        succeed(contractId)
                    } catch (e) {
                        fail(e)
                    }
                },
                onSoldOrWithdrawn: () => {},
                token: tokenId,
                wallet: managerAddress,
                price: stdlib.parseCurrency(price)
            })
        } catch (e) {
            fail(e)
        }

        const contractId = await promise

        ctx.body = { contractId, tokenId }
        ctx.status = 201
    } catch (e) {
        throw new DeployContractError(e)
    }
})

router.get('/nfts', async ctx => {
    if (!ctx.request.query.symbol) throw new MissingParameterError('symbol')

    const dbResponse = await new NftRepository().getNfts({
        symbol: ctx.request.query.symbol.toUpperCase(),
        sort: ctx.request.query.sort,
        status: ctx.request.query.status,
        pageSize: ctx.request.query.pageSize,
        nextPageKey: ctx.request.query.nextPageKey
    })

    const algoIndexer = new AlgoIndexer()

    const indexerCalls = dbResponse.assets.map(asset => algoIndexer.callAlgonodeIndexerEndpoint(`assets/${asset.id}`))
    const indexerResults = await Promise.all(indexerCalls)

    const assets = dbResponse.assets.reduce((result, asset, i) => {
        if (indexerResults[i].status === 200 && !indexerResults[i].json.asset.deleted) result.push(asset)
        return result
    }, [])

    ctx.body = {
        assets,
        nextPageKey: dbResponse.nextPageKey
    }
    ctx.status = 200
})

router.get('/nfts/:assetId', async ctx => {
    const asset = await new NftRepository().getNft(ctx.params.assetId)

    let price
    const stdlib = new ReachProvider().getStdlib()

    /* istanbul ignore next */
    if (asset.status.startsWith('forsale') && asset.contractId) {
        try {
            const algoAccount = await stdlib.newAccountFromMnemonic(process.env.ALGO_ACCOUNT_MNEMONIC)
            const contractInfo = getContractFromJsonString(asset.contractId)
            const contract = algoAccount.contract(backend, contractInfo)
            const view = contract.v.View
            const tokenId = (await view.token())[1].toNumber()
            if (tokenId !== Number(ctx.params.assetId)) throw Error('Contract token not matching')
            price = (await view.price())[1].toNumber()
        } catch (e) {
            throw new ReadContractError(e)
        }
    }

    const algoIndexer = new AlgoIndexer()

    const indexerCalls = [
        algoIndexer.callAlgonodeIndexerEndpoint(`assets/${ctx.params.assetId}`),
        algoIndexer.callAlgonodeIndexerEndpoint(`assets/${ctx.params.assetId}/balances?currency-greater-than=0`)
    ]

    const indexerResults = await Promise.all(indexerCalls)

    if (indexerResults.some(result => result.status !== 200) || indexerResults[0].json.asset.deleted) throw new NotFoundError()

    /* istanbul ignore next */
    ctx.body = {
        ...asset,
        ...(price && { price: stdlib.formatCurrency(price, 4) }),
        ...(asset.lastSalePrice && { lastSalePrice: stdlib.formatCurrency(asset.lastSalePrice, 4) }),
        url: indexerResults[0].json.asset.params.url,
        reserve: indexerResults[0].json.asset.params.reserve,
        holders: indexerResults[1].json.balances.map(balance => ({ address: balance.address, amount: balance.amount }))
    }
})

/* istanbul ignore next */
router.post('/nfts/:assetId/purchase/auth', authHandler, bodyParser(), async ctx => {
    if (!ctx.request.body.projectId) throw new MissingParameterError('projectId')
    if (!ctx.request.body.positionX === undefined) throw new MissingParameterError('positionX')
    if (!ctx.request.body.positionY === undefined) throw new MissingParameterError('positionY')

    const algoIndexer = new AlgoIndexer()
    const repository = new NftRepository()
    const projectApi = new ProjectApi()
    const stdlib = new ReachProvider().getStdlib()

    const [assetResponse, nft, projectReponse, algoAccount] = await Promise.all([
        algoIndexer.callAlgonodeIndexerEndpoint(`assets/${ctx.params.assetId}`),
        repository.getNft(ctx.params.assetId, true),
        projectApi.getProject(ctx.request.body.projectId),
        stdlib.newAccountFromMnemonic(process.env.ALGO_ACCOUNT_MNEMONIC)
    ])

    if (assetResponse.status !== 200) {
        throw new NotFoundError('Asset')
    }

    if (projectReponse.status !== 200) {
        throw new NotFoundError('Project')
    }

    if (!projectReponse.json.approved) {
        throw new ProjectNotApprovedError()
    }

    const purchaseAuth = new PurchaseAuth()

    if (nft.purchaseAuthToken) {
        const authMessage = purchaseAuth.getAuthMessage(nft.purchaseAuthToken)

        if (authMessage && ctx.state.account !== authMessage.walletAddress && Date.now() < authMessage.expiry) {
            throw new PurchaseAuthorizationAlreadyIssuedError()
        }
    }

    const contractInfo = getContractFromJsonString(nft.contractId)
    let price

    try {
        const contract = algoAccount.contract(backend, contractInfo)
        const view = contract.v.View
        const tokenId = (await view.token())[1].toNumber()
        if (tokenId !== Number(ctx.params.assetId)) throw Error('Contract token not matching')
        price = (await view.price())[1]
    } catch (e) {
        throw new ReadContractError(e)
    }

    const purchaseAuthToken = purchaseAuth.getAuthToken({
        walletAddress: ctx.state.account,
        projectId: ctx.request.body.projectId,
        positionX: ctx.request.body.positionX,
        positionY: ctx.request.body.positionY,
        price: price.toNumber()
    })

    const symbol = assetResponse.json.asset.params['unit-name']
    await repository.updateNft({ assetId: ctx.params.assetId, symbol, status: 'forsale-selling', purchaseAuthToken })

    ctx.body = { purchaseAuthToken }
    ctx.status = 201
})

/* istanbul ignore next */
router.put('/nfts/:assetId/purchase', bodyParser(), async ctx => {
    if (!ctx.request.body.purchaseAuthToken) throw new MissingParameterError('purchaseAuthToken')

    const repository = new NftRepository()
    const asset = await repository.getNft(ctx.params.assetId, true)
    if (asset.purchaseAuthToken !== ctx.request.body.purchaseAuthToken) throw new PurchaseUnauthorizedError()

    const { walletAddress, projectId, positionX, positionY, price } = new PurchaseAuth().getAuthMessage(asset.purchaseAuthToken)

    // Checks all fine, start polling

    try {
        let retries = 30
        const { promise, succeed, fail } = createPromise()

        try {
            // eslint-disable-next-line no-inner-declarations
            async function checkOwnership() {
                // console.log(`Waiting for ${walletAddress} to own ${ctx.params.assetId}, trying ${retries} more times`)
                const balanceResponse = await new AlgoIndexer().callAlgonodeIndexerEndpoint(`assets/${ctx.params.assetId}/balances?currency-greater-than=0`)
                // console.log(`Owner is ${balanceResponse.json.balances[0].address}`)

                if (balanceResponse.status === 200 && balanceResponse.json.balances[0].address === walletAddress) {
                    succeed()
                } else if (retries > 0) {
                    retries--
                    setTimeout(checkOwnership, 1000)
                } else {
                    fail()
                }
            }
            await checkOwnership()
        } catch (e) {
            fail(e)
        }

        await promise
    } catch (e) {
        throw new AssetOwnershipError(e)
    }

    try {
        await repository.updateNft({
            assetId: ctx.params.assetId,
            symbol: asset.symbol,
            status: 'sold',
            purchaseAuthToken: '.',
            lastSalePrice: price,
            projectId,
            walletAddress,
            positionX,
            positionY
        })
    } catch (e) {
        throw new UpdateAssetStatusError(e)
    }

    try {
        const deposit = Math.round(price * projectDepositPercentageOfPrice)
        await new ProjectApi().pay(projectId, deposit)
        await repository.updateNft({
            assetId: ctx.params.assetId,
            symbol: asset.symbol,
            status: 'sold-paid'
        })
    } catch (e) {
        // Ignore failure
    }

    try {
        const stdlib = new ReachProvider().getStdlib()
        const algoAccount = await stdlib.newAccountFromMnemonic(process.env.ALGO_ACCOUNT_MNEMONIC)
        const contractInfo = getContractFromJsonString(asset.contractId)
        const contract = algoAccount.contract(backend, contractInfo)
        const market = contract.a.Market
        await market.stop()
    } catch (e) {
        // Ignore failure
    }

    ctx.body = ''
    ctx.status = 204
})

app.use(requestLogger).use(errorHandler).use(router.routes()).use(router.allowedMethods())
