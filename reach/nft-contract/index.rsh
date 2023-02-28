'reach 0.1'
'use strict'

const Price = UInt
const Transaction = Tuple(Address, Price, Token)

export const main = Reach.App(() => {
    const A = Participant('Admin', {
        ...hasConsoleLogger,
        onReady: Fun(true, Null),
        onSoldOrWithdrawn: Fun(true, Null),
        token: Token,
        price: UInt,
        wallet: Address
    })

    const M = API('Market', {
        buy: Fun([], Transaction),
        withdraw: Fun([], Bool),
        stop: Fun([], Bool)
    })

    const V = View('View', {
        token: Token,
        price: UInt
    })

    init()

    A.only(() => {
        const [token, price, wallet] = declassify([interact.token, interact.price, interact.wallet])
    })
    A.publish(token, price, wallet)
    commit()

    A.pay([[1, token]])
    assert(balance(token) == 1, 'Balance of NFT is wrong')

    A.interact.onReady(getContract())
    A.interact.log('The token is on the market')

    const [withdrawn, sold, buyer, paid] = parallelReduce([false, false, A, 0])
        .define(() => {
            V.token.set(token)
            V.price.set(price)
        })
        .invariant(balance() == paid && balance(token) == 1)
        .while(!withdrawn && !sold)
        .api(
            M.buy,
            () => price,
            k => {
                k([this, price, token])
                return [false, true, this, price + paid]
            }
        )
        .api(
            M.withdraw,
            () => {
                assume(this == A)
            },
            () => 0,
            k => {
                const isAdmin = this == A
                require(isAdmin)
                k(isAdmin)
                return [true, false, buyer, paid]
            }
        )
        .timeout(false)

    transfer(paid).to(wallet)
    transfer(1, token).to(buyer)

    A.interact.onSoldOrWithdrawn()

    if (withdrawn) {
        A.interact.log('The token has been withdrawn')
        commit()
        exit()
    }

    require(balance() == 0)
    require(balance(token) == 0)

    A.interact.log('The token has been sold, waiting for end signal')

    const [stopped] = parallelReduce([false])
        .define(() => {
            V.token.set(token)
            V.price.set(price)
        })
        .invariant(balance() == 0 && balance(token) == 0)
        .while(!stopped)
        .api(
            M.stop,
            () => {
                assume(this == A)
            },
            () => 0,
            k => {
                const isAdmin = this == A
                require(isAdmin)
                k(isAdmin)
                return [true]
            }
        )
        .timeout(false)

    A.interact.log('The market is closing down....')

    require(balance() == 0)
    require(balance(token) == 0)

    commit()
    exit()
})
