import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import NotFoundError from '../error/not-found.error.js'
import DynamoDbRepository from './dynamodb.repository.js'

export default class NftRepository extends DynamoDbRepository {
    itemName = 'asset'

    async createNft({ tokenId, symbol, name, offChainImageUrl, contractId }) {
        const now = Date.now()

        return await this.put({
            item: {
                pk: { S: `asset|${tokenId}` },
                gsi1pk: { S: `symbol|${symbol}` },
                data: { S: `asset|${symbol}|forsale|${now}` },
                created: { N: now.toString() },
                name: { S: name },
                offchainUrl: { S: offChainImageUrl },
                contractId: { S: contractId }
            },
            itemLogName: this.itemName
        })
    }

    async getNfts({ symbol, status, projectId, pageSize, nextPageKey, sort }) {
        const forward = sort && sort === 'desc' ? false : true
        let condition = projectId ? 'gsi2pk = :gsi2pk' : 'gsi1pk = :gsi1pk'

        if (status && symbol) {
            symbol = symbol.toUpperCase()
            condition = `${condition} AND begins_with(#data, :status)`
        }

        let data
        if (projectId) {
            data = await this.query({
                indexName: 'gsi2',
                conditionExpression: condition,
                ...(status && { attributeNames: { '#data': 'data' } }),
                attributeValues: {
                    ':gsi2pk': { S: `project|${projectId}` },
                    ...(status && symbol && { ':status': { S: `asset|${symbol}|${status}` } })
                },
                pageSize,
                nextPageKey,
                forward
            })
        } else {
            data = await this.query({
                indexName: 'gsi1',
                conditionExpression: condition,
                ...(status && { attributeNames: { '#data': 'data' } }),
                attributeValues: {
                    ':gsi1pk': { S: `symbol|${symbol}` },
                    ...(status && symbol && { ':status': { S: `asset|${symbol}|${status}` } })
                },
                pageSize,
                nextPageKey,
                forward
            })
        }

        return {
            assets: data.items.map(asset => ({
                id: asset.pk.S.replace('asset|', ''),
                ...(asset.name && { name: asset.name.S }),
                ...(asset.data && { status: asset.data.S.split('|')[2] }),
                ...(asset.created && { created: parseInt(asset.created.N) }),
                ...(asset.withdrawn && { archived: parseInt(asset.withdrawn.N) }),
                ...(asset.positionX && { positionX: parseInt(asset.positionX.N) }),
                ...(asset.positionY && { positionY: parseInt(asset.positionY.N) }),
                ...(asset.offchainUrl && { offChainImageUrl: asset.offchainUrl.S })
            })),
            ...(data.nextPageKey && { nextPageKey: data.nextPageKey })
        }
    }

    async getNft(assetId, withPurchaseAuthToken = false) {
        try {
            const data = await this.get({
                key: { pk: { S: `asset|${assetId}` } },
                itemLogName: this.itemName
            })

            if (data.Item) {
                return {
                    id: assetId,
                    symbol: data.Item.gsi1pk.S.replace('symbol|', ''),
                    name: data.Item.name.S,
                    status: data.Item.data.S.split('|')[2],
                    offChainImageUrl: data.Item.offchainUrl.S,
                    created: parseInt(data.Item.created.N),
                    ...(data.Item.contractId && { contractId: data.Item.contractId.S }),
                    ...(data.Item.gsi2pk && { projectId: data.Item.gsi2pk.S.replace('project|', '') }),
                    ...(data.Item.positionX && { positionX: parseInt(data.Item.positionX.N) }),
                    ...(data.Item.positionY && { positionY: parseInt(data.Item.positionY.N) }),
                    ...(data.Item.withdrawn && { withdrawn: parseInt(data.Item.withdrawn.N) }),
                    ...(data.Item.sold && { sold: parseInt(data.Item.sold.N) }),
                    ...(data.Item.lastSalePrice && { lastSalePrice: parseInt(data.Item.lastSalePrice.N) }),
                    ...(withPurchaseAuthToken && data.Item.purchaseAuthToken && { purchaseAuthToken: data.Item.purchaseAuthToken.S })
                }
            }

            throw new NotFoundError()
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) throw new NotFoundError()
            else throw e
        }
    }

    async updateNft({ assetId, symbol, status, purchaseAuthToken, projectId, walletAddress, positionX, positionY, lastSalePrice }) {
        try {
            const now = Date.now()

            await this.update({
                key: { pk: { S: `asset|${assetId}` } },
                attributes: {
                    ...(symbol && status && { '#data': { S: `asset|${symbol}|${status}|${now}` } }),
                    ...(purchaseAuthToken && { purchaseAuthToken: { S: purchaseAuthToken } }),
                    ...(projectId && { gsi2pk: { S: `project|${projectId}` } }),
                    ...(walletAddress && { gsi3pk: { S: `user|${walletAddress}` } }),
                    ...(positionX !== undefined && { positionX: { N: positionX.toString() } }),
                    ...(positionY != undefined && { positionY: { N: positionY.toString() } }),
                    ...(status === 'sold' && { sold: { N: now.toString() } }),
                    ...(lastSalePrice && { lastSalePrice: { N: now.toString() } })
                },
                itemLogName: this.itemName
            })
        } catch (e) {
            if (e instanceof ConditionalCheckFailedException) throw new NotFoundError()
            else throw e
        }
    }
}
