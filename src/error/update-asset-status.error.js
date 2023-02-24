import GenericError from './generic.error.js'

export default class UpdateAssetStatusError extends GenericError {
    httpCode = 500
    error

    constructor(error) {
        super()
        this.error = error
    }

    toJson() {
        return {
            error: 'UpdateAssetStatusError',
            message: 'Unable to update asset status'
        }
    }
}
