import { memo, useCallback } from 'react'
import { Grid } from '@material-ui/core'

const sortIcon = (v, field) => {
  if (v === field) {
    return <div style={{transform: 'scaleY(0.7)'}}>▲</div>
  }
  if (v === '-' + field) {
    return <div style={{transform: 'scaleY(0.7)'}}>▼</div>
  }
  return (
    <div className="flex flex-col inline-block leading-none" style={{ fontSize: 9, transform: 'scaleY(0.7)' }}>
      <div>▲</div>
      <div>▼</div>
    </div>
  )
}

const PoolHeader = ({
  sortField,
  setSortField,
  chain,
  ...rest
}) => {
  const handleClickAPY = useCallback(() => {
    setSortField(s => {
      switch(s) {
        case '-apy':
          return 'apy'
        case 'apy':
          return null
        default:
          return '-apy'
      }
    })
  }, [setSortField])
  const handleClickTVL = useCallback(() => {
    setSortField(s => {
      switch(s) {
        case '-tvl':
          return 'tvl'
        case 'tvl':
          return null
        default:
          return '-tvl'
      }
    })
  }, [setSortField])

  return (
    <div className="sticky top-0 bg-white dark:bg-black border-b dark:border-gray-700 text-left py-2 text-xs sm:text-sm pl-3 pr-2 text-gray-500 dark:text-gray-400 select-none">
      <Grid container spacing={1} wrap="nowrap" alignItems="flex-end">
        <Grid item className="flex-auto cursor-pointer" onClick={handleClickTVL}>
          <div className="font-semibold">Token</div>
          <div className="font-semibold flex space-x-1">
            {sortIcon(sortField, 'tvl')}
            <div>TVL</div>
          </div>
        </Grid>
        <Grid item className="w-20 sm:w-24 text-right font-semibold cursor-pointer" onClick={handleClickAPY}>
          <div className="flex justify-end items-center space-x-1">
            {sortIcon(sortField, 'apy')}
            <div>APY</div>
          </div>
          <div className="">Daily APR</div>
        </Grid>
        <Grid item className="w-20 sm:w-24 text-right font-semibold">
          <div>Balance</div>
          <div>Deposit</div>
          { chain === 'bsc' && <div>Rewards</div> }
        </Grid>
        <Grid item className="w-7 sm:w-8">
        </Grid>
      </Grid>
    </div>
  )
}

export default memo(PoolHeader)
