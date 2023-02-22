import fetch from 'node-fetch'

function projectApiEndpoint(path) {
    return `${process.env.PROJECT_CONTRACT_API_URL}/${path}`
}

export default class ProjectApi {
    async getProject(contractId) {
        const response = await fetch(projectApiEndpoint(`projects/${contractId}`))
        return {
            status: response.status,
            json: await response.json()
        }
    }

    async pay(contractId, amount) {
        const response = await fetch(projectApiEndpoint(`projects/${contractId}/deposit/${amount}`), { method: 'post' })
        return {
            status: response.status,
            json: await response.json()
        }
    }
}
