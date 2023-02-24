import GenericError from './generic.error.js'

export class ProjectNotApprovedError extends GenericError {
    httpCode = 400
    message

    constructor() {
        super()
    }

    toJson() {
        return {
            error: 'ProjectNotApprovedError',
            message: 'The project specified has not been approved'
        }
    }
}
