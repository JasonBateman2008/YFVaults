import { memo, useCallback } from 'react'
import classnames from 'classnames'
import { indexBy, prop } from 'ramda'
import { Collapse } from '@material-ui/core'

export const chains = [
//   { id: 56, c: 'bsc', label: 'BSC' },
  { id: 128, c: 'heco', label: 'HECO'},
]
export const chainsById = indexBy(prop('id'), chains)
export const chainsByCode = indexBy(prop('c'), chains)

const ChainOption = ({ chain, activeChain, setChain, chainId }) => {
  const handleClick = useCallback(() => {
    setChain(chain.c)
  }, [chain, setChain])
  const active = chain.c === activeChain

  return (
    <button
      onClick={handleClick}
      className={classnames(
        'text-2xl font-semibold cursor-pointer transition',
        active ? 'text-black dark:text-white' : 'text-gray-400 dark:text-gray-500',
        !active && 'hover:text-gray-500 dark:hover:text-gray-400'
      )}
    >
      { chain.label }
    </button>
  )
}

const Chain = ({
  chain,
  setChain,
  chainId
}) => {
  const walletChain = chainsById[chainId]
  const mismatch = false //chainId && chainId !== chainsByCode[chain]?.id

  return (
    <div className="px-3">
      { chains.length > 1 && (
        <div className="flex space-x-3">
          { chains.map(c => (
            <ChainOption
              key={c.id}
              chain={c}
              activeChain={chain}
              setChain={setChain}
              chainId={chainId}
            />
          ))}
        </div>
      )}
      <Collapse in={ mismatch }>
        <div className="mt-2 text-yellow-600 dark:text-yellow-400 pb-2 sm:text-base text-sm">
          <div className="font-semibold">Your wallet is connected to the {walletChain?.c?.toUpperCase() || 'wrong'} network.</div>
          <div>Please switch your network to enable your balances, deposits and withdrawals.</div>
        </div>
      </Collapse>
    </div>
  )
}

export default memo(Chain)
