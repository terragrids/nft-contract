import { app } from './app.js'
import request from 'supertest'

const mockStdlib = {
    setProviderByName: jest.fn().mockImplementation(() => jest.fn()),
    getProvider: jest.fn().mockImplementation(() => jest.fn()),
    newAccountFromMnemonic: jest.fn().mockImplementation(() => jest.fn()),
    createAccount: jest.fn().mockImplementation(() => jest.fn()),
    protect: jest.fn().mockImplementation(() => jest.fn()),
    formatAddress: jest.fn().mockImplementation(() => jest.fn()),
    launchToken: jest.fn().mockImplementation(() => jest.fn()),
    algosdk: jest.fn().mockImplementation(() => jest.fn()),
    makeAssetConfigTxnWithSuggestedParamsFromObject: jest.fn().mockImplementation(() => jest.fn()),
    waitForConfirmation: jest.fn().mockImplementation(() => jest.fn()),
    tokensAccepted: jest.fn().mockImplementation(() => jest.fn())
}

jest.mock('./provider/reach-provider.js', () =>
    jest.fn().mockImplementation(() => ({
        getStdlib: jest.fn().mockImplementation(() => ({
            setProviderByName: mockStdlib.setProviderByName,
            getProvider: mockStdlib.getProvider,
            newAccountFromMnemonic: mockStdlib.newAccountFromMnemonic,
            createAccount: mockStdlib.createAccount,
            protect: mockStdlib.protect,
            formatAddress: mockStdlib.formatAddress,
            launchToken: mockStdlib.launchToken,
            tokensAccepted: mockStdlib.tokensAccepted,
            algosdk: {
                makeAssetConfigTxnWithSuggestedParamsFromObject: mockStdlib.makeAssetConfigTxnWithSuggestedParamsFromObject,
                waitForConfirmation: mockStdlib.waitForConfirmation
            }
        })),
        getEnv: jest.fn().mockImplementation(() => 'TestNet')
    }))
)

const mockDynamoDbRepository = {
    testConnection: jest.fn().mockImplementation(() => jest.fn())
}
jest.mock('./repository/dynamodb.repository.js', () =>
    jest.fn().mockImplementation(() => ({
        testConnection: mockDynamoDbRepository.testConnection
    }))
)

const mockNftRepository = {
    createNft: jest.fn().mockImplementation(() => jest.fn()),
    getNft: jest.fn().mockImplementation(() => jest.fn()),
    getNfts: jest.fn().mockImplementation(() => jest.fn())
}
jest.mock('./repository/nft.repository.js', () =>
    jest.fn().mockImplementation(() => ({
        createNft: mockNftRepository.createNft,
        getNft: mockNftRepository.getNft,
        getNfts: mockNftRepository.getNfts
    }))
)

const mockAlgoIndexer = {
    callAlgonodeIndexerEndpoint: jest.fn().mockImplementation(() => jest.fn())
}
jest.mock('./provider/algo-indexer.js', () =>
    jest.fn().mockImplementation(() => ({
        callAlgonodeIndexerEndpoint: mockAlgoIndexer.callAlgonodeIndexerEndpoint
    }))
)

import authHandler from './middleware/auth-handler.js'
jest.mock('./middleware/auth-handler.js')

jest.mock('../reach/nft-contract/build/index.main.mjs', () => jest.fn().mockImplementation(() => ({})))

import { algorandAddressFromCID, cidFromAlgorandAddress } from './utils/token-utils.js'

jest.mock('./utils/token-utils.js', () => ({
    algorandAddressFromCID: jest.fn().mockImplementation(() => ''),
    cidFromAlgorandAddress: jest.fn().mockImplementation(() => '')
}))

jest.mock('crypto-random-string', () => ({
    cryptoRandomString: jest.fn().mockImplementation(() => 'crypto-random-string')
}))

describe('app', function () {
    const OLD_ENV = process.env

    beforeEach(() => {
        jest.clearAllMocks()
        authHandler.mockImplementation(async (ctx, next) => {
            ctx.state.account = 'user account'
            await next()
        })
        process.env = { ...OLD_ENV } // make a copy
    })

    afterAll(() => {
        process.env = OLD_ENV // restore old env
    })

    describe('get root endpoint', function () {
        it('should return 200 when calling root endpoint', async () => {
            const response = await request(app.callback()).get('/')
            expect(response.status).toBe(200)
            expect(response.text).toBe('terragrids nft contract api')
        })
    })

    describe('get health check endpoint', function () {
        it('should return 200 when calling hc endpoint and all is healthy', async () => {
            mockStdlib.getProvider.mockImplementation(() =>
                Promise.resolve({
                    algodClient: { healthCheck: () => ({ do: async () => Promise.resolve({}) }) },
                    indexer: { makeHealthCheck: () => ({ do: async () => Promise.resolve({ version: '1.2.3' }) }) }
                })
            )

            mockDynamoDbRepository.testConnection.mockImplementation(() =>
                Promise.resolve({
                    status: 200,
                    region: 'test-region'
                })
            )

            mockStdlib.newAccountFromMnemonic.mockImplementation(() => ({ networkAccount: {} }))

            const response = await request(app.callback()).get('/hc')
            expect(response.status).toBe(200)
            expect(response.status).toBe(200)
            expect(response.body).toEqual({
                env: 'dev',
                region: 'local',
                db: {
                    status: 'ok',
                    region: 'test-region'
                },
                reach: {
                    network: 'TestNet',
                    algoClient: 'ok',
                    algoIndexer: 'ok',
                    algoAccount: 'ok'
                }
            })
        })

        it('should return 200 when calling hc endpoint and algo client is faulty', async () => {
            mockStdlib.getProvider.mockImplementation(() =>
                Promise.resolve({
                    algodClient: { healthCheck: () => ({ do: async () => Promise.resolve({ error: 'error' }) }) },
                    indexer: { makeHealthCheck: () => ({ do: async () => Promise.resolve({ version: '1.2.3' }) }) }
                })
            )

            mockDynamoDbRepository.testConnection.mockImplementation(() =>
                Promise.resolve({
                    status: 200,
                    region: 'test-region'
                })
            )

            mockStdlib.newAccountFromMnemonic.mockImplementation(() => ({ networkAccount: {} }))

            const response = await request(app.callback()).get('/hc')
            expect(response.status).toBe(200)
            expect(response.status).toBe(200)
            expect(response.body).toEqual({
                env: 'dev',
                region: 'local',
                db: {
                    status: 'ok',
                    region: 'test-region'
                },
                reach: {
                    network: 'TestNet',
                    algoClient: 'error',
                    algoIndexer: 'ok',
                    algoAccount: 'ok'
                }
            })
        })

        it('should return 200 when calling hc endpoint and algo indexer is faulty', async () => {
            mockStdlib.getProvider.mockImplementation(() =>
                Promise.resolve({
                    algodClient: { healthCheck: () => ({ do: async () => Promise.resolve({}) }) },
                    indexer: { makeHealthCheck: () => ({ do: async () => Promise.resolve({}) }) }
                })
            )

            mockDynamoDbRepository.testConnection.mockImplementation(() =>
                Promise.resolve({
                    status: 200,
                    region: 'test-region'
                })
            )

            mockStdlib.newAccountFromMnemonic.mockImplementation(() => ({ networkAccount: {} }))

            const response = await request(app.callback()).get('/hc')
            expect(response.status).toBe(200)
            expect(response.status).toBe(200)
            expect(response.body).toEqual({
                env: 'dev',
                region: 'local',
                db: {
                    status: 'ok',
                    region: 'test-region'
                },
                reach: {
                    network: 'TestNet',
                    algoClient: 'ok',
                    algoIndexer: 'error',
                    algoAccount: 'ok'
                }
            })
        })

        it('should return 200 when calling hc endpoint and algo account is faulty', async () => {
            mockStdlib.getProvider.mockImplementation(() =>
                Promise.resolve({
                    algodClient: { healthCheck: () => ({ do: async () => Promise.resolve({}) }) },
                    indexer: { makeHealthCheck: () => ({ do: async () => Promise.resolve({ version: '1.2.3' }) }) }
                })
            )

            mockDynamoDbRepository.testConnection.mockImplementation(() =>
                Promise.resolve({
                    status: 200,
                    region: 'test-region'
                })
            )

            mockStdlib.newAccountFromMnemonic.mockImplementation(() => ({}))

            const response = await request(app.callback()).get('/hc')
            expect(response.status).toBe(200)
            expect(response.status).toBe(200)
            expect(response.body).toEqual({
                env: 'dev',
                region: 'local',
                db: {
                    status: 'ok',
                    region: 'test-region'
                },
                reach: {
                    network: 'TestNet',
                    algoClient: 'ok',
                    algoIndexer: 'ok',
                    algoAccount: 'error'
                }
            })
        })

        it('should return 200 when calling hc endpoint and db in faulty', async () => {
            mockStdlib.getProvider.mockImplementation(() =>
                Promise.resolve({
                    algodClient: { healthCheck: () => ({ do: async () => Promise.resolve({}) }) },
                    indexer: { makeHealthCheck: () => ({ do: async () => Promise.resolve({ version: '1.2.3' }) }) }
                })
            )

            mockDynamoDbRepository.testConnection.mockImplementation(() =>
                Promise.resolve({
                    status: 500,
                    region: 'test-region'
                })
            )

            mockStdlib.newAccountFromMnemonic.mockImplementation(() => ({ networkAccount: {} }))

            const response = await request(app.callback()).get('/hc')
            expect(response.status).toBe(200)
            expect(response.status).toBe(200)
            expect(response.body).toEqual({
                env: 'dev',
                region: 'local',
                db: {
                    status: 'error',
                    region: 'test-region'
                },
                reach: {
                    network: 'TestNet',
                    algoClient: 'ok',
                    algoIndexer: 'ok',
                    algoAccount: 'ok'
                }
            })
        })
    })

    describe('post nft endpoint', function () {
        beforeEach(() => {
            mockStdlib.protect.mockImplementation(() => {})

            process.env.ADMIN_WALLETS = 'admin_wallet,super_wallet'
            authHandler.mockImplementation(async (ctx, next) => {
                ctx.state.account = 'admin_wallet'
                await next()
            })
        })

        it('should return 201 when posting new nft and all is fine', async () => {
            mockStdlib.launchToken.mockImplementation(() => ({
                id: { toNumber: () => 1234 }
            }))

            algorandAddressFromCID.mockImplementation(() => ({ address: 'reserve_address', url: 'token_url' }))
            cidFromAlgorandAddress.mockImplementation(() => 'cid')

            const adminInterface = {
                Admin: ({ log, onReady }) => {
                    log('ready')
                    onReady('contract')
                }
            }
            const adminSpy = jest.spyOn(adminInterface, 'Admin')
            mockStdlib.newAccountFromMnemonic.mockImplementation(() => ({
                networkAccount: { addr: 'wallet_address' },
                contract: () => ({
                    p: adminInterface
                })
            }))

            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(mockStdlib.launchToken).toHaveBeenCalledTimes(1)
            expect(mockStdlib.launchToken).toHaveBeenCalledWith(expect.any(Object), 'name', 'TRLD', {
                decimals: 0,
                manager: 'wallet_address',
                clawback: 'wallet_address',
                freeze: 'wallet_address',
                reserve: 'reserve_address',
                supply: 1,
                url: 'token_url'
            })

            expect(adminSpy).toHaveBeenCalledTimes(1)
            expect(adminSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    price: 123,
                    token: 1234,
                    wallet: 'wallet_address'
                })
            )

            expect(mockNftRepository.createNft).toHaveBeenCalledTimes(1)
            expect(mockNftRepository.createNft).toHaveBeenCalledWith({
                symbol: 'TRLD',
                contractId: 'ImNvbnRyYWN0Ig==',
                name: 'name',
                offChainImageUrl: 'image_url',
                tokenId: 1234
            })

            expect(response.status).toBe(201)
            expect(response.body).toEqual({
                contractId: 'ImNvbnRyYWN0Ig==',
                tokenId: 1234
            })
        })

        it('should return 201 when posting new nft with long name', async () => {
            mockStdlib.launchToken.mockImplementation(() => ({
                id: { toNumber: () => 1234 }
            }))

            algorandAddressFromCID.mockImplementation(() => ({ address: 'reserve_address', url: 'token_url' }))
            cidFromAlgorandAddress.mockImplementation(() => 'cid')

            const adminInterface = {
                Admin: ({ log, onReady }) => {
                    log('ready')
                    onReady('contract')
                }
            }
            const adminSpy = jest.spyOn(adminInterface, 'Admin')
            mockStdlib.newAccountFromMnemonic.mockImplementation(() => ({
                networkAccount: { addr: 'wallet_address' },
                contract: () => ({
                    p: adminInterface
                })
            }))

            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'Louisville and Nashville Railroad Office Building',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(mockStdlib.launchToken).toHaveBeenCalledTimes(1)
            expect(mockStdlib.launchToken).toHaveBeenCalledWith(expect.any(Object), 'Louisville and Nashville Rail…', 'TRLD', {
                decimals: 0,
                manager: 'wallet_address',
                clawback: 'wallet_address',
                freeze: 'wallet_address',
                reserve: 'reserve_address',
                supply: 1,
                url: 'token_url'
            })

            expect(adminSpy).toHaveBeenCalledTimes(1)
            expect(adminSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    price: 123,
                    token: 1234,
                    wallet: 'wallet_address'
                })
            )

            expect(mockNftRepository.createNft).toHaveBeenCalledTimes(1)
            expect(mockNftRepository.createNft).toHaveBeenCalledWith({
                symbol: 'TRLD',
                name: 'Louisville and Nashville Railroad Office Building',
                contractId: 'ImNvbnRyYWN0Ig==',
                offChainImageUrl: 'image_url',
                tokenId: 1234
            })

            expect(response.status).toBe(201)
            expect(response.body).toEqual({
                contractId: 'ImNvbnRyYWN0Ig==',
                tokenId: 1234
            })
        })

        it('should return 500 when launch token fails', async () => {
            mockStdlib.launchToken.mockImplementation(() => {
                throw new Error()
            })

            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(response.status).toBe(500)
            expect(response.body).toEqual({
                error: 'MintTokenError',
                message: 'Unable to mint token'
            })
        })

        it('should return 500 when cid verification fails', async () => {
            algorandAddressFromCID.mockImplementation(() => ({ address: 'reserve_address', url: 'token_url' }))
            cidFromAlgorandAddress.mockImplementation(() => 'meh')

            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(response.status).toBe(500)
            expect(response.body).toEqual({
                error: 'MintTokenError',
                message: 'Unable to mint token'
            })
        })

        it('should return 500 when deploying contract fails', async () => {
            mockStdlib.launchToken.mockImplementation(() => ({
                id: { toNumber: () => 1234 }
            }))

            algorandAddressFromCID.mockImplementation(() => ({ address: 'reserve_address', url: 'token_url' }))
            cidFromAlgorandAddress.mockImplementation(() => 'cid')

            mockStdlib.newAccountFromMnemonic.mockImplementation(() => ({
                networkAccount: { addr: 'wallet_address' },
                contract: () => {
                    throw new Error()
                }
            }))

            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(response.status).toBe(500)
            expect(response.body).toEqual({
                error: 'DeployContractError',
                message: 'Unable to deploy nft contract'
            })
        })

        it('should return 500 when retrieving contract info fails', async () => {
            mockStdlib.launchToken.mockImplementation(() => ({
                id: { toNumber: () => 1234 }
            }))

            algorandAddressFromCID.mockImplementation(() => ({ address: 'reserve_address', url: 'token_url' }))
            cidFromAlgorandAddress.mockImplementation(() => 'cid')

            mockStdlib.newAccountFromMnemonic.mockImplementation(() => ({
                networkAccount: { addr: 'wallet_address' },
                contract: () => ({
                    p: {
                        Admin: ({ onReady }) => onReady(/* undefined contract */)
                    }
                })
            }))

            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(response.status).toBe(500)
            expect(response.body).toEqual({
                error: 'DeployContractError',
                message: 'Unable to deploy nft contract'
            })
        })

        it('should return 500 when saving contract in repository fails', async () => {
            mockNftRepository.createNft.mockImplementation(() => {
                throw new Error()
            })

            mockStdlib.launchToken.mockImplementation(() => ({
                id: { toNumber: () => 1234 }
            }))

            algorandAddressFromCID.mockImplementation(() => ({ address: 'reserve_address', url: 'token_url' }))
            cidFromAlgorandAddress.mockImplementation(() => 'cid')

            mockStdlib.newAccountFromMnemonic.mockImplementation(() => ({
                networkAccount: { addr: 'wallet_address' },
                contract: () => ({
                    p: {
                        Admin: ({ log, onReady }) => {
                            log('ready')
                            onReady('contract')
                        }
                    }
                })
            }))

            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(response.status).toBe(500)
            expect(response.body).toEqual({
                error: 'DeployContractError',
                message: 'Unable to deploy nft contract'
            })
        })

        it('should return 400 when nft name is missing', async () => {
            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: 'MissingParameterError',
                message: 'name must be specified'
            })
        })

        it('should return 400 when nft symbol is missing', async () => {
            const response = await request(app.callback()).post('/nfts').send({
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: 'MissingParameterError',
                message: 'symbol must be specified'
            })
        })

        it('should return 400 when nft symbol is too long', async () => {
            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'aaaaaaaaaa',
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: 'ParameterTooLongError',
                message: 'symbol is too long'
            })
        })

        it('should return 400 when nft cid is missing', async () => {
            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: 'MissingParameterError',
                message: 'cid must be specified'
            })
        })

        it('should return 400 when nft offChainImageUrl is missing', async () => {
            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                cid: 'cid',
                price: 123
            })

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: 'MissingParameterError',
                message: 'offChainImageUrl must be specified'
            })
        })

        it('should return 400 when nft price is missing', async () => {
            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url'
            })

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: 'MissingParameterError',
                message: 'price must be specified'
            })
        })

        it('should return 403 when nft creator is not an admin', async () => {
            authHandler.mockImplementation(async (ctx, next) => {
                ctx.state.account = 'bogus user'
                await next()
            })

            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: 123
            })

            expect(response.status).toBe(403)
            expect(response.body).toEqual({
                error: 'UserUnauthorizedError',
                message: 'The authenticated user is not authorized to perform this action'
            })
        })

        it('should return 400 when nft name is too long', async () => {
            const response = await request(app.callback())
                .post('/nfts')
                .send({
                    symbol: 'trld',
                    name: '#'.repeat(129),
                    cid: 'cid',
                    offChainImageUrl: 'image_url',
                    price: 123
                })

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: 'ParameterTooLongError',
                message: 'name is too long'
            })
        })

        it('should return 400 when project offChainImageUrl is too long', async () => {
            const response = await request(app.callback())
                .post('/nfts')
                .send({
                    symbol: 'trld',
                    name: 'name',
                    cid: 'cid',
                    offChainImageUrl: '#'.repeat(129),
                    price: 123
                })

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: 'ParameterTooLongError',
                message: 'offChainImageUrl is too long'
            })
        })

        it('should return 400 when nft price is not valid', async () => {
            const response = await request(app.callback()).post('/nfts').send({
                symbol: 'trld',
                name: 'name',
                cid: 'cid',
                offChainImageUrl: 'image_url',
                price: -2
            })

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: 'ParameterNotValidError',
                message: 'price is not valid'
            })
        })
    })

    describe('get nfts endpoint', function () {
        it('should return 200 when getting nfts and all is fine', async () => {
            mockNftRepository.getNfts.mockImplementation(() => ({
                assets: [
                    {
                        id: 1,
                        name: 'name 1',
                        status: 'forsale',
                        offChainImageUrl: 'image_url_1',
                        created: 'date-1'
                    },
                    {
                        id: 2,
                        name: 'name 2',
                        status: 'sold',
                        offChainImageUrl: 'image_url_2',
                        created: 'date-2'
                    },
                    {
                        id: 3,
                        name: 'name 3',
                        status: 'sold',
                        offChainImageUrl: 'image_url_3',
                        created: 'date-3'
                    }
                ],
                nextPageKey: 'next_page_key'
            }))

            mockAlgoIndexer.callAlgonodeIndexerEndpoint.mockImplementation(params => {
                const id = parseInt(params.replace('assets/', ''))
                return Promise.resolve({
                    status: 200,
                    json: {
                        asset: {
                            index: id,
                            deleted: id === 2,
                            params: {
                                name: `name ${id}`,
                                total: 1,
                                decimals: 0,
                                'unit-name': 'TRLD',
                                url: 'url',
                                reserve: 'reserve'
                            }
                        }
                    }
                })
            })

            const response = await request(app.callback()).get('/nfts?symbol=trld&sort=asc&status=sold&pageSize=12&nextPageKey=page-key')

            expect(mockNftRepository.getNfts).toHaveBeenCalledTimes(1)
            expect(mockNftRepository.getNfts).toHaveBeenCalledWith({
                symbol: 'TRLD',
                sort: 'asc',
                status: 'sold',
                nextPageKey: 'page-key',
                pageSize: '12'
            })

            expect(response.status).toBe(200)
            expect(response.body).toEqual({
                assets: [
                    {
                        id: 1,
                        name: 'name 1',
                        status: 'forsale',
                        offChainImageUrl: 'image_url_1',
                        created: 'date-1'
                    },
                    {
                        id: 3,
                        name: 'name 3',
                        status: 'sold',
                        offChainImageUrl: 'image_url_3',
                        created: 'date-3'
                    }
                ],
                nextPageKey: 'next_page_key'
            })
        })

        it('should return 400 when getting nfts with no symbol', async () => {
            const response = await request(app.callback()).get('/nfts?sort=asc&status=sold&pageSize=12&nextPageKey=page-key')

            expect(mockNftRepository.getNfts).not.toHaveBeenCalled()

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: 'MissingParameterError',
                message: 'symbol must be specified'
            })
        })
    })

    describe('get nft endpoint', function () {
        it('should return 200 when getting nft and all is fine', async () => {
            mockNftRepository.getNft.mockImplementation(() => ({
                id: 1,
                symbol: 'TRLD',
                name: 'name',
                status: 'forsale',
                offChainImageUrl: 'image_url',
                created: 'date'
            }))

            mockAlgoIndexer.callAlgonodeIndexerEndpoint.mockImplementation(params => {
                switch (params) {
                    case 'assets/1':
                        return Promise.resolve({
                            status: 200,
                            json: {
                                asset: {
                                    index: 1,
                                    params: {
                                        name: 'name-from-indexer',
                                        total: 1,
                                        decimals: 0,
                                        'unit-name': 'TRLD',
                                        url: 'https://terragrids.org#1',
                                        reserve: 'reserve'
                                    }
                                }
                            }
                        })
                    case 'assets/1/balances?currency-greater-than=0':
                        return Promise.resolve({
                            status: 200,
                            json: {
                                balances: [
                                    {
                                        address: 'test_address_1',
                                        amount: 1,
                                        deleted: false
                                    },
                                    {
                                        address: 'test_address_2',
                                        amount: 1,
                                        deleted: false
                                    }
                                ]
                            }
                        })
                }
            })

            const response = await request(app.callback()).get('/nfts/1')

            expect(mockNftRepository.getNft).toHaveBeenCalledTimes(1)
            expect(mockNftRepository.getNft).toHaveBeenCalledWith('1')

            expect(response.status).toBe(200)
            expect(response.body).toEqual({
                id: 1,
                symbol: 'TRLD',
                name: 'name',
                status: 'forsale',
                offChainImageUrl: 'image_url',
                created: 'date',
                url: 'https://terragrids.org#1',
                reserve: 'reserve',
                holders: [
                    {
                        address: 'test_address_1',
                        amount: 1
                    },
                    {
                        address: 'test_address_2',
                        amount: 1
                    }
                ]
            })
        })

        it('should return 404 when getting nft and asset not returned by indexer', async () => {
            mockNftRepository.getNft.mockImplementation(() => ({
                id: 1,
                symbol: 'TRLD',
                name: 'name',
                status: 'forsale',
                offChainImageUrl: 'image_url',
                created: 'date'
            }))

            mockAlgoIndexer.callAlgonodeIndexerEndpoint.mockImplementation(params => {
                switch (params) {
                    case 'assets/1':
                        return Promise.resolve({
                            status: 404
                        })
                    case 'assets/1/balances?currency-greater-than=0':
                        return Promise.resolve({
                            status: 200,
                            json: {
                                balances: [
                                    {
                                        address: 'test_address_1',
                                        amount: 1,
                                        deleted: false
                                    },
                                    {
                                        address: 'test_address_2',
                                        amount: 1,
                                        deleted: false
                                    }
                                ]
                            }
                        })
                }
            })

            const response = await request(app.callback()).get('/nfts/1')

            expect(mockNftRepository.getNft).toHaveBeenCalledTimes(1)
            expect(mockNftRepository.getNft).toHaveBeenCalledWith('1')

            expect(response.status).toBe(404)
            expect(response.body).toEqual({
                error: 'NotFoundError',
                message: 'Item specified not found'
            })
        })

        it('should return 404 when getting nft and asset returned deleted by indexer', async () => {
            mockNftRepository.getNft.mockImplementation(() => ({
                id: 1,
                symbol: 'TRLD',
                name: 'name',
                status: 'forsale',
                offChainImageUrl: 'image_url',
                created: 'date'
            }))

            mockAlgoIndexer.callAlgonodeIndexerEndpoint.mockImplementation(params => {
                switch (params) {
                    case 'assets/1':
                        return Promise.resolve({
                            status: 200,
                            json: {
                                asset: {
                                    index: 1,
                                    deleted: true,
                                    params: {
                                        name: 'name-from-indexer',
                                        total: 1,
                                        decimals: 0,
                                        'unit-name': 'TRLD',
                                        url: 'https://terragrids.org#1',
                                        reserve: 'reserve'
                                    }
                                }
                            }
                        })
                    case 'assets/1/balances?currency-greater-than=0':
                        return Promise.resolve({
                            status: 200,
                            json: {
                                balances: [
                                    {
                                        address: 'test_address_1',
                                        amount: 1,
                                        deleted: false
                                    },
                                    {
                                        address: 'test_address_2',
                                        amount: 1,
                                        deleted: false
                                    }
                                ]
                            }
                        })
                }
            })

            const response = await request(app.callback()).get('/nfts/1')

            expect(mockNftRepository.getNft).toHaveBeenCalledTimes(1)
            expect(mockNftRepository.getNft).toHaveBeenCalledWith('1')

            expect(response.status).toBe(404)
            expect(response.body).toEqual({
                error: 'NotFoundError',
                message: 'Item specified not found'
            })
        })
    })
})
