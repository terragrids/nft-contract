import GenericError from './generic.error.js'

export class PurchaseUnauthorizedError extends GenericError {
    httpCode = 403
    message

    constructor() {
        super()
    }

    toJson() {
        return {
            error: 'PurchaseUnauthorizedError',
            message: 'This purchase is not authorized'
        }
    }
}
