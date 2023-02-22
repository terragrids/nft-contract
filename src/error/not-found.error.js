import GenericError from './generic-error.js'

export default class NotFoundError extends GenericError {
    httpCode = 404
    item

    constructor(item) {
        super()
        this.item = item
    }

    toJson() {
        return {
            error: 'NotFoundError',
            message: `${this.item ? this.item : 'Item'} specified not found`
        }
    }
}
