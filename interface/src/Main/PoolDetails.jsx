import { memo, useState, useCallback } from 'react'
import { ethers } from 'ethers'
import { useMutation } from 'react-query'
import { token, currency, formatNumber } from './lib/numFormat'

const PoolDetails = ({
  pid,
  pool,
  userStakedWantToken,
  userWantsBalance,
  userPendingAUTO,
  priceAUTO,
  deposit,
  withdraw,
  hasAutoRewards = true,
}) => {
  const depositMutation = useMutation(deposit)
  const withdrawMutation = useMutation(withdraw)
  const harvestMutation = useMutation(withdraw)

  const [depositAmt, setDepositAmt] = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')

  const handleDeposit = useCallback((e) => {
    e.preventDefault();
    depositMutation.mutateAsync({ pid, amt: depositAmt })
      .then(() => setDepositAmt(''))
  }, [depositAmt, depositMutation, pid])

  const handleWithdraw = useCallback((e) => {
    e.preventDefault();
    withdrawMutation.mutateAsync({ pid, amt: withdrawAmt })
      .then(() => setWithdrawAmt(''))
  }, [withdrawAmt, withdrawMutation, pid])

  const handleHarvest = useCallback(() => {
    harvestMutation.mutate({ pid, amt: '0' })
  }, [pid, harvestMutation])

  return (
    <div className="px-3 flex-auto w-full">
      <div className="flex items-stretch space-y-3 md:space-y-0 md:space-x-3 flex-col md:flex-row">
        <div className="flex-auto flex flex-col">
          <div className="flex justify-between flex-auto">
            <div className="font-semibold">Balance</div>
            <div onClick={() => setDepositAmt(userWantsBalance)} className="cursor-pointer text-right">
              {token(userWantsBalance)} ({currency(userWantsBalance * pool.wantPrice) })
            </div>
          </div>

          <form onSubmit={handleDeposit}>
            <div className="relative">
            <input
              className="mt-1 dark:bg-gray-800 border dark:border-gray-800 border-gray-300 rounded p-2 w-full mb-2"
              onChange={e => setDepositAmt(e.target.value)}
              value={depositAmt}
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              placeholder="0"
              disabled={depositMutation.isLoading}
            />
            <div className="text-xs btn absolute right-0 text-blue-500 cursor-pointer"
              style={{ padding: '0.3rem', top: '50%', transform: 'translateY(-50%)', right: '0.5rem' }}
              onClick={() => setDepositAmt(userWantsBalance)}
            >MAX</div>
            </div>

            <button className="btn btn-primary w-full" disabled={depositMutation.isLoading}>
              {depositMutation.isLoading
                ? 'Depositing...'
                : `Deposit`
              }
            </button>
          </form>
        </div>
        <div className="flex-auto">
          <div className="flex justify-between">
            <div className="font-semibold">Deposit </div>
            <div onClick={() => setWithdrawAmt(userStakedWantToken)} className="cursor-pointer text-right">
            {token(userStakedWantToken)} ({currency(userStakedWantToken * pool.wantPrice) })
            <div className="text-xs text-gray-500">
              {
                formatNumber(
                  userStakedWantToken /
                  parseFloat(ethers.utils.formatUnits(pool.wantLockedTotal, pool.wantDecimals))
                  * 100,
                  2
                )
              }% of vault
            </div>

            </div>
          </div>
          <form onSubmit={handleWithdraw}>
            <div className="relative">
            <input
              className="mt-1 dark:bg-gray-800 border dark:border-gray-800 border-gray-300 rounded p-2 w-full mb-2"
              value={withdrawAmt}
              onChange={e => setWithdrawAmt(e.target.value)}
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              placeholder="0"
              disabled={withdrawMutation.isLoading}
            />
            <div className="text-xs btn absolute right-0 text-blue-500 cursor-pointer"
              style={{ padding: '0.3rem', top: '50%', transform: 'translateY(-50%)', right: '0.5rem' }}
              onClick={(e) => setWithdrawAmt(userStakedWantToken)}
            >MAX</div>
            </div>

            <button className="btn btn-primary w-full" disabled={withdrawAmt <= 0 || withdraw.isLoading}>
              {withdrawMutation.isLoading ? 'Withdrawing...' : (
                `${userPendingAUTO > 1e-6 ? 'Harvest & ' : ''}Withdraw`
              )}
            </button>
          </form>
        </div>

        { hasAutoRewards && (
          <div className="text-left flex sm:flex-col flex-wrap space-y-1">
            <div className="font-semibold">AUTO&nbsp;Rewards</div>
            <div className="flex flex-auto flex-col justify-end text-right sm:text-left">
              <div>
                <div className="md:text-lg sm:font-semibold leading-none">
                  {token(userPendingAUTO)}
                </div>
                <div className="text-gray-500">
                  {currency(userPendingAUTO *  priceAUTO) }
                </div>
              </div>

            </div>

            <button
              disabled={ !userPendingAUTO || parseFloat(userPendingAUTO) === 0 || withdrawMutation.isLoading }
              onClick={handleHarvest}
              className="btn btn-secondary w-full"
            >
              {withdrawMutation.isLoading || harvestMutation.isLoading
                ? 'Harvesting...'
                : 'Harvest'
              }
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

export default memo(PoolDetails)
