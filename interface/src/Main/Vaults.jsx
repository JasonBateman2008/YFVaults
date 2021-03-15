// tslint:disable:no-console
import { useMemo, useState, useCallback, useEffect } from 'react'
import { Switch, Route, useRouteMatch } from 'react-router-dom'
import { identity, sortBy, uniqBy, sum, values, compose, mapObjIndexed } from 'ramda'

import { useQuery } from 'react-query'
import axios from 'axios'
import { ethers } from 'ethers';
import {BigNumber} from '@ethersproject/bignumber'      // Also works requires BigNumber.from()
import constants from './constants'
import { token } from './lib/numFormat'
import Loading from './Loading'

import { Grid, Collapse } from '@material-ui/core';

import Dashboard from './Dashboard'
import Pool from './Pool'
import PoolSummary from './PoolSummary';
import ToolBar from './Toolbar'
import Chain from './Chain'
import LP from './LP'

import useWalletData from './wallet'

let hashCompletionHandled = {}

const instance = axios.create({
  baseURL: constants.serverURLBase2,
});
const instanceHeco = axios.create({
  baseURL: constants.serverURLBaseHeco,
});

const fetchStats = () => instance.get('get_stats').then(({data}) => data)
const fetchHecoStats = () => instanceHeco.get('get_stats').then(({data}) => data)
const fetchFarmData = () => instance.get('get_farms_data').then(({data}) => data)
const fetchHecoFarmData = () => instanceHeco.get('get_farms_data').then(({data}) => data)

const refetchStatsInterval = 20000

const Vaults = ({ chain, setChain, web3, web3_np, address, connectionOK, notify, chainId }) => {
  const { path } = useRouteMatch()
  const [ degen, setDegen ] = useState(false)

  const toggleDegen = useCallback(() => {
    setDegen(d => !d)
    setSelectedFarm(null)
  }, [setDegen])

  useEffect(() => {
    setDegen(false)
  }, [chain, setDegen])

  useEffect(() => {
    if (chainId === 56 && chain === 'heco') {
      setChain('bsc')
    }
    if (chainId === 128 && chain === 'bsc') {
      setChain('heco')
    }
  }, [chainId, chain, setChain])

  const bscStats = useQuery('bsc-stats', fetchStats, {
    refetchInterval: refetchStatsInterval
  })
  const hecoStats = useQuery('heco-stats', fetchHecoStats, {
    refetchInterval: refetchStatsInterval
  })
  const stats = chain === 'bsc' ? bscStats : hecoStats

  const bscFarms = useQuery('bsc-farm', fetchFarmData)
  const hecoFarms = useQuery('heco-farm', fetchHecoFarmData)
  const farms = chain === 'bsc' ? bscFarms : hecoFarms

  const hasDegen = farms?.data?.degenRowOnwards < farms?.data?.table_data?.length

  const walletData = useWalletData(
    farms,
    address,
    web3,
    web3_np,
    connectionOK,
    chain,
    chainId
  );
  const userData = walletData.userData;

  const tvls = useMemo(() => ({
    bsc: bscStats.data?.platformTVL,
    heco: hecoStats.data?.platformTVL
  }), [bscStats.data, hecoStats.data])

  const totalTVL = tvls?.bsc + tvls?.heco

  const totalPendingAUTO = useMemo(
    () => sum(values(userData?.data?.pendingAUTO)),
    [userData?.data?.pendingAUTO]
  )
  const totalStaked = useMemo(
    () => sum(values(mapObjIndexed(
      (staked, pid) => {
        const price = farms?.data?.pools?.[pid]?.wantPrice || 0
        return staked * price
      },
      userData?.data?.staked
    ))),
    [userData?.data?.staked, farms?.data?.pools]
  )

  const deposit = useCallback(({ pid, amt }) => {
    if (!amt) {
      return
    }
    let contract = walletData.autoContract
    const normalizedAmt = (amt.match(/,/g) || []).length === 1
      ? amt.replace(',', '.')
      : amt

    const autoRewards = userData?.data?.pendingAUTO?.[pid]

    const contractDeposit = (pid) => new Promise((resolve, reject) => {
      contract.p.methods.deposit(pid, ethers.utils.parseUnits(normalizedAmt, 18) ).send({ from: address}, (err, data) => { if (err) { console.log(err) } } )
      .on('error', (error) => {
        reject(error)
      })
      .on('transactionHash', (transactionHash) => { notify("Deposit pending..."); console.log(transactionHash, "pending...") })
      .on('receipt', (receipt) => {
        console.log(receipt, "receipt") // contains the new contract address
        if (!hashCompletionHandled[receipt.blockHash]){
          hashCompletionHandled[receipt.blockHash] = true
          let message = 'Deposit complete!'
          if (autoRewards > 0) {
            message += ` ${token(autoRewards)} AUTO Harvested`
          }
          notify(message)
          userData.refetch()
          resolve(receipt)
        }
      })
      .on('confirmation', function(confirmationNumber, receipt){
        // console.log(receipt, "confirmation") // contains the new contract address
      })
    })

    // Approve if allowance less than amt
    const vault = walletData.poolsByPid?.[pid]
    if ( !userData.data?.allowances[pid]
    || BigNumber.from(userData.data?.allowances[pid].toString()).lt(ethers.utils.parseUnits(amt, 18))  ){
      notify("Approval required.")
      let wantTokenContract = vault.contract
      let autoFarmContractAddress = constants.autoFarmV2ContractAddress[chain]
      return new Promise((resolve, reject) => {
        wantTokenContract.p.methods.approve(
          autoFarmContractAddress,
          ethers.utils.parseUnits("5", 76)
        ).send({ from: address }, (err, data) => { if (err) { console.log(err) } } )
        .on('error', (error) => {  console.log(error); reject(error)  })
        .on('transactionHash', (transactionHash) => {
          notify("Approving...")
          console.log(transactionHash, "Approving...") })
        .on('receipt', (receipt) => {
          console.log("receipt") // contains the new contract address
          if (!hashCompletionHandled[receipt.blockHash]){
            hashCompletionHandled[receipt.blockHash] = true
            notify("Approval complete!")
            resolve(contractDeposit(pid))
          } else {
            console.log("hashCompletionHandled")
          }
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          console.log(receipt, "confirmation") // contains the new contract address
        })
      })

    } else {
      // console.log("APPROVED ALR", this.state.userWantsAllowance[wantAddress.toLowerCase()])
      return contractDeposit(pid)
    }
  }, [chain, userData, walletData.autoContract, walletData.poolsByPid, address, notify])

  const approve = useCallback(({ pid }) => {
    const wantTokenContract = walletData.poolsByPid?.[pid]?.contract
    const autoFarmContractAddress = constants.autoFarmV2ContractAddress[chain]

    return new Promise((resolve, reject) => {
      wantTokenContract.p.methods.approve(
        autoFarmContractAddress,
        ethers.utils.parseUnits("5", 76)
      ).send({ from: address }, err => { if (err) { console.log(err) } } )
      .on('error', (error) => {  console.log(error); reject(error)  })
      .on('transactionHash', (transactionHash) => {
        notify("Approving...")
        console.log(transactionHash, "Approving...") })
      .on('receipt', (receipt) => {
        console.log("receipt") // contains the new contract address
        if (!hashCompletionHandled[receipt.blockHash]){
          hashCompletionHandled[receipt.blockHash] = true
          notify("Approval complete!")
        } else {
          console.log("hashCompletionHandled")
        }
      })
      .on('confirmation', (confirmationNumber, receipt) => {
        console.log(receipt, "confirmation") // contains the new contract address
      })
    })
  }, [ chain, walletData, address, notify ])

  const withdraw = useCallback(({ pid, amt }) => {
    if (!amt) {
      return
    }
    let contract = walletData.autoContract
    const normalizedAmt = (amt.match(/,/g) || []).length === 1
      ? amt.replace(',', '.')
      : amt

    const parsedAmt = ethers.utils.parseUnits(normalizedAmt, 18)

    return new Promise((resolve, reject) => {
      contract.p.methods.withdraw(pid, parsedAmt ).send({ from: address}, (err, data) => { if (err) { console.log(err) } } )
        .on('error', function(error){
          console.error(error)
          reject(error)
        })
        .on('transactionHash', (transactionHash) => {
          notify("Withdraw pending...");
          console.log(transactionHash, "pending...")
        })
        .on('receipt', (receipt) => {
          console.log(receipt, "receipt") // contains the new contract address
          if (!hashCompletionHandled[receipt.blockHash]){
            hashCompletionHandled[receipt.blockHash] = true
            notify('Withdraw complete')
            userData.refetch()
            resolve(receipt)
          }
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          // console.log(confirmationNumber, "confirmation") // contains the new contract address
        })
    })
  }, [userData, walletData.autoContract, notify, address]);

  const withdrawAll = useCallback(({ pid }) => {
    const contract = walletData.autoContract

    return new Promise((resolve, reject) => {
      contract.p.methods.withdrawAll(pid).send({ from: address}, err => { if (err) { console.log(err) } } )
        .on('error', function(error){
          console.error(error)
          reject(error)
        })
        .on('transactionHash', (transactionHash) => {
          notify("Withdraw pending...");
          console.log(transactionHash, "pending...")
        })
        .on('receipt', (receipt) => {
          console.log(receipt, "receipt") // contains the new contract address
          if (!hashCompletionHandled[receipt.blockHash]){
            hashCompletionHandled[receipt.blockHash] = true
            notify('Withdraw complete')
            userData.refetch()
            resolve(receipt)
          }
        })
        .on('confirmation', (confirmationNumber, receipt) => {
          // console.log(confirmationNumber, "confirmation") // contains the new contract address
        })
    })
  }, [userData, walletData.autoContract, notify, address]);

  const harvestAll = useCallback(async () => {
    let contract = walletData.autoContract
    const batch = new web3.BatchRequest()

    const pids = Object.keys(farms.data.pools)
    const pidsWithAutoRewards = pids.filter(pid =>
      userData.data.pendingAUTO[pid] > 1e-6
    )
    const requests = pidsWithAutoRewards.map(pid =>
      new Promise((resolve, reject) => batch.add(
        contract.p.methods.withdraw(pid, 0)
          .send.request({ from: address }, (err, data) => {
            if (err) { return reject(err) }
            resolve(data)
          })
      ))
    )
    batch.execute()
    await Promise.all(requests)
    await new Promise(resolve => setTimeout(resolve, 7000))
    userData.refetch()
    notify('All rewards harvested')
  }, [userData, walletData.autoContract, notify, address,farms.data, web3]);

  const [selectedFarm, setSelectedFarm] = useState(null)

  useEffect(() => {
    setSelectedFarm(null)
  }, [chain, setSelectedFarm])

  const farmChoices = useMemo(() => compose(
    xs => [{farm: null, farmName: 'All'}, ...xs],
    uniqBy(({ farmName }) => farmName),
    xs => xs.map(
      ({ farm, farmName }) => ({ farm, farmName })
    ),
    xs => xs.map(([pid]) => farms?.data.pools?.[pid]),
    xs => degen
      ? xs.slice(farms?.data?.degenRowOnwards)
      : xs.slice(0, farms?.data?.degenRowOnwards)
  )(farms?.data?.table_data || []), [farms?.data, degen])

  const [sortField] = useState(null)

  const [hideEmpty, setHideEmpty] = useState(false)

  const pools = useMemo(
    () => compose(
      hideEmpty
        ? xs => xs.filter(([pid]) =>
          userData.data?.staked?.[pid] > 1e-6
        )
        : identity,
      sortField
        ? sortBy(([pid, multiplier, asset, farm, tvl, apy]) => {
          if (sortField === 'apy') {
            return parseFloat(apy)
          }
          if (sortField === '-apy') {
            return -parseFloat(apy)
          }
          if (sortField === 'tvl') {
            return parseFloat(tvl)
          }
          if (sortField === '-tvl') {
            return -parseFloat(tvl)
          }
          return 0
        })
        : identity,
      xs => selectedFarm
        ? xs.filter(([pid]) => {
          const { farmName } = farms?.data?.pools?.[pid]
          return farmName === selectedFarm
        })
        : xs,
      xs => degen
        ? xs.slice(farms?.data?.degenRowOnwards)
        : xs.slice(0, farms?.data?.degenRowOnwards)
    )(farms?.data?.table_data || []),
    [degen, farms?.data, selectedFarm, sortField, userData.data, hideEmpty]
  )

  const numHarvestable = useMemo(() => userData.data?.pendingAUTO &&
    Object.values(userData.data?.pendingAUTO)
      .filter(x => x >= 1e-6)
      .length,
    [userData.data]
  )

  return (
    <div className="max-w-3xl m-auto flex flex-col pb-64">
      <Switch>
        <Route path="/farms/:pid">
          <div className="pt-32">
            { farms.isLoading ?
              <div className="text-center py-5 text-xl font-semibold text-gray-500">
                <Loading />
              </div> :
              <PoolSummary
                pools={pools}
                farms={farms?.data?.pools}
                userData={userData?.data}
                priceAUTO={stats?.data?.priceAUTO}
                withdraw={withdraw}
                withdrawAll={withdrawAll}
                deposit={deposit}
                approve={approve}
              />
            }
          </div>
        </Route>
        <Route path={path}>
          <>
            <Dashboard
              stats={stats}
              platformTVL={totalTVL}
              tvls={tvls}
              priceAUTO={stats?.data?.priceAUTO}
              totalPendingAUTO={totalPendingAUTO}
              totalStaked={totalStaked}
              chain={chain}
              showBuyAuto={chain === 'bsc'}
              harvestAll={harvestAll}
              numHarvestable={numHarvestable}
            />

            { farms.isLoading && (
              <div className="text-center py-5 text-xl font-semibold text-gray-500">
                <Loading />
              </div>
            )}

            <Collapse in={farms.isSuccess} timeout={2000}>
              <Chain
                chain={chain}
                setChain={setChain}
                chainId={chainId}
              />
              <ToolBar
                degen={degen}
                hasDegen={hasDegen}
                toggleDegen={toggleDegen}
                selectedFarm={selectedFarm}
                setSelectedFarm={setSelectedFarm}
                farmChoices={farmChoices}
                hideEmpty={hideEmpty}
                setHideEmpty={setHideEmpty}
              />

              <Switch>
                <Route path="/lp">
                  <LP />
                </Route>
                <Route exact path={path}>
                  <Grid container spacing={2}>
                    { pools?.map(summary => {
                      const pid = summary[0]
                      const pools = farms.data.pools
                      const pool = pools[pid]

                      return (
                        <Pool
                          key={pid}
                          pid={pid}
                          summary={summary}
                          pool={pool}
                          userPendingAUTO={userData?.data?.pendingAUTO?.[pid]}
                          userWantsBalance={userData?.data?.balances?.[pid]}
                          userStakedWantToken={userData?.data?.staked?.[pid]}
                          priceAUTO={stats?.data?.priceAUTO}
                          withdraw={withdraw}
                          deposit={deposit}
                          hasAutoRewards={chain === 'bsc' && !degen}
                          chain={chain}
                        />
                      )
                    })}
                  </Grid>
                </Route>
              </Switch>

              <div className="text-sm text-center text-gray-500 my-5">
                Auto-compound assets. Earn YF & USDT.
              </div>

            </Collapse>
          </>
        </Route>
      </Switch>
    </div>
  )
}

export default Vaults
