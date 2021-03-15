import React, { Component } from 'react';
import { Grid, IconButton, Tooltip } from '@material-ui/core';
import { Add , Remove } from '@material-ui/icons';

class DepositWithdrawButtons extends Component {
  constructor(props) {
    super(props);
    this.state = {
      depositAmt: "", //this.props.userWantsBalances[this.props.pid], // "",
      withdrawAmt: "",
    };
  }


  // shouldComponentUpdate(nextProps)
  componentDidUpdate(prevProps, prevState) {
    // console.log(prevProps, this.props, "componentDidUpdate, prevProps,  this.props")
    let pid = this.props.pid

    if (pid === -1){ return }
    let setStateObject = {}
    if (
      (this.props.userWantsBalances[pid] !== this.state.depositAmt )
      && (this.state.depositAmt === prevState.depositAmt)
    ){
      setStateObject.depositAmt =  this.props.userWantsBalances[pid]
    }

    if (
      (this.props.userStakedWantTokens[pid] !== this.state.withdrawAmt )
      && (this.state.withdrawAmt === prevState.withdrawAmt)
    ){
      setStateObject.withdrawAmt =  this.props.userStakedWantTokens[pid]
    }


    if (Object.keys(setStateObject).length > 0 ){
      this.setState(setStateObject, ()=>{})
    }


  }

  componentDidMount(){

    // console.log("DepositWithdrawButtons componentDidMount()")
    // console.log(this.state, "this.state")
    // console.log(this.props, "this.props")

    // setTimeout(()=>{
    //   if ( this.state.depositAmt == "" && this.state.withdrawAmt == ""
    //   // &&  this.props.networkSupported
    //   ){
    //     // this.setState({depositAmt: "0.0", withdrawAmt: "0.0" })
    //   }
    // }, 5000)


    // userWantsBalances={this.state.userWantsBalances}
    // userPendingAUTO={this.state.userPendingAUTO}
    // userStakedWantTokens = {this.state.userStakedWantTokens}

}

renderButton() {
  let allowDeposit = true
  if (!this.props.allowDeposits){ allowDeposit = false }
  if (this.state.depositAmt === ""){ allowDeposit = false }
  // if (!this.props.networkSupported){ allowDeposit = false }

  let allowWithdraw = true
  if (this.state.depositAmt === ""){ allowWithdraw = false }
  // if (!this.props.networkSupported){ allowWithdraw = false }

  const depositButton =
  <Tooltip title="Harvest & Deposit">
    <IconButton
      disabled= { !allowDeposit }
      style={{padding: "0px", marginLeft:"3px"}}
      onClick={()=>{
        this.props.handleDepositClicked( this.props.pid,  this.state.depositAmt )
      }}
    >
      <Add/>
    </IconButton>
  </Tooltip>


  const withdrawButton =
  <Tooltip title="Harvest & Withdraw">
    <IconButton
      disabled=  { !allowWithdraw }
      style={{padding: "0px", marginLeft:"3px"}}
      onClick={()=>{
        this.props.handleWithdrawClicked( this.props.pid,  this.state.withdrawAmt )
      }}
    >
      <Remove/>
    </IconButton>
  </Tooltip>


  if (this.props.withdraw){
    return withdrawButton
  } else {
    return depositButton
  }

}

  render() {

    return (
      <div>
        <div style={{ alignItems: "center", justifyContent: "space-between", maxWidth:"200px"}}>


          <Grid container spacing={0}>
                    <Grid item sm={11} xs={8} style={{paddingLeft:"1px"}}>
                        <input
                          style={{
                            fontSize:"0.875rem",
                            width:"100%",
                            color: "rgba(0, 0, 0, 0.87)",
                            border: "3px solid #f2f2f2",
                            outline:"none"
                          }}
                          value={ this.props.withdraw ? this.state.withdrawAmt : this.state.depositAmt}
                          onChange={(e)=>{
                            if (this.props.withdraw) {
                              this.setState({ withdrawAmt : e.target.value})
                            } else {
                              this.setState({ depositAmt : e.target.value})
                            }
                          }}

                          type="number"
                        />
                    </Grid>
                    <Grid item sm={1} xs={4}>

                      {this.renderButton()}

                    </Grid>

                </Grid>

        </div>

      </div>

    );
  }
}



export default DepositWithdrawButtons;
