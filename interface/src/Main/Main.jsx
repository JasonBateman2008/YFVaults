import * as React from 'react'
import { Switch, Route } from "react-router-dom"

import Vaults from './Vaults'
import Swap from './Swap'
import NFT from './NFT'
import DAO from './DAO'
import BotNavBar from './BotNavBar'

import constants from './constants'
import { ToastContainer, toast, Slide } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

class App extends React.PureComponent {

  constructor(props) {
    super(props)

    this.state = {
      page: "vaults",
    }
  }

  notify = (msg) => {
    toast.dark(msg)
  }

  render = () => {
    const props = {
      notify: this.notify,

      connectionOK: this.props.connectionOK,
      connected:    this.props.connected,
      chainId:      this.props.chainId,
      address:      this.props.address,
      web3:         this.props.web3,
      web3_np:      this.props.web3_np,
      chain:        this.props.chain,
      setChain:     this.props.setChain,
    }

    return (
      <>
        <div style={{ minHeight: "630px", overflow: 'hidden' }}>
          <ToastContainer
            transition={Slide}
            position="bottom-left"
            autoClose={3000}
            hideProgressBar
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
          />

          <Switch>
            <Route path="/nft"><NFT /></Route>
            <Route path="/dao"><DAO /></Route>
            <Route path="/swap"><Swap /></Route>
            <Route path="/"><Vaults {...props} /></Route>
          </Switch>

          { constants.mode === "prod" ? "" : <h3>Mode: {constants.mode}</h3> }
        </div>
        <BotNavBar/>
      </>
    )
  };
}

export default App

