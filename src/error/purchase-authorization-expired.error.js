import GenericError from './generic.error.js'

export class PurchaseAuthorizationAlreadyIssuedError extends GenericError {
    httpCode = 403
    message

    constructor() {
        super()
    }

    toJson() {
        return {
            error: 'PurchaseAuthorizationAlreadyIssuedError',
            message: 'This purchase authorization has already been issued'
        }
    }
}
