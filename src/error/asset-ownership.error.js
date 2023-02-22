import GenericError from './generic-error.js'

export default class AssetOwnershipError extends GenericError {
    httpCode = 404
    error

    constructor(error) {
        super()
        this.error = error
    }

    toJson() {
        return {
            error: 'AssetOwnershipError',
            message: 'Unable to verify asset ownership'
        }
    }
}
