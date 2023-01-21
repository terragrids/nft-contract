import GenericError from './generic-error.js'

export default class ParameterNotValidError extends GenericError {
    httpCode = 400
    message

    constructor(parameter) {
        super()
        this.message = `${parameter} is not valid`
    }

    toJson() {
        return {
            error: 'ParameterNotValidError',
            message: this.message
        }
    }
}
