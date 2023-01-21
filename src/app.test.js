import { app } from './app.js'
import request from 'supertest'

const mockStdlib = {
    setProviderByName: jest.fn().mockImplementation(() => jest.fn()),
    getProvider: jest.fn().mockImplementation(() => jest.fn()),
    newAccountFromMnemonic: jest.fn().mockImplementation(() => jest.fn()),
    createAccount: jest.fn().mockImplementation(() => jest.fn()),
    protect: jest.fn().mockImplementation(() => jest.fn()),
    formatAddress: jest.fn().mockImplementation(() => jest.fn())
}

jest.mock('./provider/reach-provider.js', () =>
    jest.fn().mockImplementation(() => ({
        getStdlib: jest.fn().mockImplementation(() => ({
            setProviderByName: mockStdlib.setProviderByName,
            getProvider: mockStdlib.getProvider,
            newAccountFromMnemonic: mockStdlib.newAccountFromMnemonic,
            createAccount: mockStdlib.createAccount,
            protect: mockStdlib.protect,
            formatAddress: mockStdlib.formatAddress
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

import authHandler from './middleware/auth-handler.js'
jest.mock('./middleware/auth-handler.js')

jest.mock('../reach/nft-contract/build/index.main.mjs', () => jest.fn().mockImplementation(() => ({})))

import { algorandAddressFromCID, cidFromAlgorandAddress } from './utils/token-utils.js'

jest.mock('./utils/token-utils.js', () => ({
    algorandAddressFromCID: jest.fn().mockImplementation(() => ''),
    cidFromAlgorandAddress: jest.fn().mockImplementation(() => '')
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
})
