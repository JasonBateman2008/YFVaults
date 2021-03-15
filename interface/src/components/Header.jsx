import { memo, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { Grid } from '@material-ui/core'

import classnames from 'classnames'
import AccountBalanceWalletIcon from '@material-ui/icons/AccountBalanceWallet'
import logo from '../assets/logo.png'

const Header = ({ onConnect, connected, connectionOK, address, loadingWallet }) => {
  const handleConnect = useCallback(() => {
    if (!connectionOK) {
      onConnect();
    }
  }, [ connectionOK, onConnect ]);

  return (
    <div className="py-2 bg-black-60">
      <div className="max-w-3xl m-auto flex items-center justify-between space-x-2">
        <div className="flex items-center space-x-1 sm:space-x-2">
          <div style={{ width: '9rem' }}>
            <img className="w-full" src={logo} alt="YF VAULTS" />
          </div>
        </div>

        <div className="space-x-6 items-center hidden sm:flex">
          <NavLink to="/" exact className="nav-link" isActive={ match => match }>Vaults</NavLink>
          <NavLink to="/swap" className="nav-link" isActive={ match => match }>Swap</NavLink>
          <NavLink to="/nft" className="nav-link" isActive={ match => match }>NFT</NavLink>
          <NavLink to="/dao" className="nav-link" isActive={ match => match }>DAO</NavLink>
        </div>
        <div className="flex items-center space-x-2 lg:space-x-4">
          <div
            onClick={ handleConnect }
            className="btn-tertiary"
          >
            <Grid container className={classnames(
              'space-x-2 px-3 linear-gradient-border',
              address && 'linear-gradient-border-outlined'
            )}>
              <Grid container alignItems="center">
                { connectionOK === null &&
                  <AccountBalanceWalletIcon fontSize="small" />
                }
                <span className="text-xs">
                  { connectionOK && address
                    && (address.slice(0, 8) + "..." + address.slice(-4))
                  }
                  { connectionOK === false && 'WRONG NETWORK' }
                  { connectionOK === null && 'CONNECT WALLET' }
                </span>
              </Grid>
            </Grid>
          </div>
        </div>
      </div>
      <div className="space-x-2 items-center flex sm:hidden pt-5 justify-center">
        <NavLink to="/" exact className="nav-link" isActive={ match => match }>Vaults</NavLink>
        <NavLink to="/swap" className="nav-link" isActive={ match => match }>Swap</NavLink>
        <NavLink to="/nft" className="nav-link" isActive={ match => match }>NFT</NavLink>
        <NavLink to="/dao" className="nav-link" isActive={ match => match }>DAO</NavLink>
      </div>
    </div >
  )
}

export default memo(Header)
