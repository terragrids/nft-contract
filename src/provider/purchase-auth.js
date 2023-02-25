import cryptoRandomString from 'crypto-random-string'
import { minutes30 } from '../utils/constants.js'

export default class PurchaseAuth {
    getAuthToken({ walletAddress, projectId, price, positionX, positionY }) {
        const nonce = `${cryptoRandomString({ length: 32 })}-${Date.now() + minutes30}`
        const message = {
            walletAddress,
            projectId,
            price,
            positionX,
            positionY,
            nonce
        }

        return Buffer.from(JSON.stringify(message)).toString('base64')
    }

    getAuthMessage(token) {
        try {
            const message = JSON.parse(Buffer.from(token, 'base64').toString('ascii'))
            return { ...message, expiry: Number(message.nonce.split('-')[1]) }
        } catch (e) {
            return null
        }
    }
}
