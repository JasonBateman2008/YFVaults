import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { ethers } from 'ethers'
import { mergeLeft, indexBy } from 'ramda'

import constants from './constants'
import { getERC20TokenContract, getAutoFarmContract } from './contracts'

const batchFetch = (fn, decimals) => ({ pools, batch }) => {
  const ps = Promise.all(pools.map(({ pid, ...rest }) =>
    new Promise((resolve, reject) => {
      const request = fn({ pid, ...rest }).call.request({}, (err, data) => {
        if (err) {
          console.log(err);
          console.log('reject!!!')
          reject(err);
          return
        }
        let formatted = data
        if (decimals !== false) {
          formatted = ethers.utils.formatUnits(data.toString(), decimals || rest.pool.wantDecimals)
        }
        resolve({ pid, data: formatted })
      })
      batch.add(request)
    })
  ))
  return ps.then(response => response.map(({ pid, data }) => {
    /*if (parseInt(pendingAUTO) > 90000){
      pendingAUTO = 0
    }*/
    return {[pid]: data}
  }).reduce(mergeLeft, {}))
}

const fetchUserPendingAUTO = ({ autoContract, address, ...rest }) => batchFetch(
  ({ pid }) => autoContract.np.methods.pendingAUTO(pid, address),
  18
)(rest)

const fetchBalances = ({ address, ...rest }) => batchFetch(
  ({ contract }) => contract.np.methods.balanceOf(address)
)(rest)
const fetchAllowances = ({ address, autoContractAddress, ...rest }) => batchFetch(
  ({ contract }) => contract.np.methods.allowance(address, autoContractAddress),
  false
)(rest)
const fetchStaked = ({ autoContract, address, ...rest }) => batchFetch(
  ({ pid }) => autoContract.np.methods.stakedWantTokens(pid, address)
)(rest)


const useUserData = (farms, address, web3, web3_np, connectionOK, chain, chainId) => {
  const getContract = useMemo(
    () => web3 && web3_np && getERC20TokenContract(web3, web3_np),
    [web3, web3_np]
  )
  const autoContract = useMemo(
    () => web3 && web3_np && getAutoFarmContract(web3, web3_np, chain),
    [web3, web3_np, chain],
  );
  const pools = useMemo(() => getContract && farms?.data?.poolsDisplayOrder?.map(pid => {
    const pool = farms.data.pools[pid]
    let wantAddress = pool.wantAddress || pool.poolInfo.want
    if (!wantAddress) {
      return false;
    }
    const contract = getContract(wantAddress)
    return { pid, pool, contract }
  }).filter(Boolean), [farms?.data?.poolsDisplayOrder, farms?.data?.pools, getContract])

  const poolsByPid = useMemo(() => pools && indexBy(v => v.pid, pools), [pools])
  const autoContractAddress = constants.autoFarmV2ContractAddress[chain]

  return {
    userData: useQuery(
      ['userData', { address, chain }],
      () => {
        const batch = new web3_np.BatchRequest()
        const ps = Promise.all([
          chain === 'bsc' && fetchUserPendingAUTO,
          fetchBalances,
          fetchAllowances,
          fetchStaked
        ].map(fn => fn && fn({ pools, address, autoContract, autoContractAddress, batch })))
        batch.execute()
        return ps.then(([pendingAUTO, balances, allowances, staked]) => ({
          pendingAUTO, balances, allowances, staked
        }))
      },
      {
        enabled: !!connectionOK && !!pools && !!address && !!autoContract,
        refetchInterval: 20000,
      }
    ),
    autoContract,
    poolsByPid
  }
}

export default useUserData

