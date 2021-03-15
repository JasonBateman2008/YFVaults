import { memo } from 'react'
import { Grid } from '@material-ui/core'
import commaNumber from 'comma-number'
import constants from './constants'

const PoolInfo = ({ pool, chain = 'bsc' }) => (
  <Grid container spacing={1} className="text-xs">
    <Grid item sm={6} xs={12} md={3}>
        <div style={{ textAlign:"left", paddingBottom:"5px"}}>

          <div> <b>Vault Details</b></div>
          <div>Asset:
            <a target="_blank" rel="noreferrer" href={pool.wantLink}  style={{ textDecoration: "none", color: "inherit", paddingLeft:"3px" }}>
              <u>{pool.wantName}</u>
            </a>
            <span style={{color:"grey", display:!isNaN(pool.APR) ? "" : "none" }}> (${commaNumber((pool.wantPrice).toFixed(2))})</span>

          </div>

          <div>AUTO multiplier:  { (pool.poolInfo.allocPoint / 100).toFixed(2) }x </div>
          <div>Type:  { pool.stratType ? pool.stratType : "auto-compounding" } </div>

          <div>Farm name:  { pool.farmName ? pool.farmName : "" } </div>


            <div>Farm contract:
              <a target="_blank" rel="noreferrer" href={ constants.blockExplorerURLBase[chain] + "address/" + pool.farmContractAddress} style={{ textDecoration: "none", color: "inherit" }}>
                {/* {pool.farmContractAddress}  */} <u>view</u>
              </a>
            </div>

            <div>Vault contract:
              <a target="_blank" rel="noreferrer" href={ constants.blockExplorerURLBase[chain] + "address/" + pool.poolInfo.strat} style={{ textDecoration: "none", color: "inherit" }}>
                {/* {pool.poolInfo.strat} */}  <u>view</u>
              </a>
            </div>

        </div>
    </Grid>
    <Grid item  sm={6} xs={12} md={3}>
          <div style={{ textAlign:"left", paddingBottom:"5px"}}>
              <div> <b>APY Calculations</b> </div>
              <div> Farm APR: {!isNaN(pool.APR) ? (pool.APR * 100 ).toFixed(1) + "%": "TBD" }
                <span style={{color:"grey", display:!isNaN(pool.APR) ? "" : "none" }}> ({commaNumber((pool.APR * 100 / 364 ).toFixed(2))}% daily)</span>
              </div>
              <div> Optimal compounds per year: {!isNaN(pool.compoundsPerYear) ? commaNumber(pool.compoundsPerYear): "TBD"} </div>
              <div> Farm APY: {!isNaN(pool.APY) ? commaNumber((pool.APY * 100 ).toFixed(1))  + "%": "TBD"}  </div>
              <div> AUTO APR: {!isNaN(pool.APR_AUTO) ? (pool.APR_AUTO * 100 ).toFixed(1)  + "%": "TBD"}
                <span style={{color:"grey", display:!isNaN(pool.APR_AUTO) ? "" : "none" }}> ({commaNumber((pool.APR_AUTO * 100 / 364 ).toFixed(2))}% daily)</span>
              </div>

              <div> Total APY: {!isNaN(pool.APY_total) ? commaNumber((pool.APY_total * 100 ).toFixed(1))  + "%": "TBD"} </div>
          </div>
    </Grid>
    <Grid item  sm={6} xs={12} md={3}>
          <div style={{ textAlign:"left", paddingBottom:"5px"}}>
              <div> <b>Fees</b> </div>
              <div> Controller fee: {pool.controllerFeeText}</div>
              <div> Platform fee: {pool.platformFeeText || 'none'}</div>
              <div> AUTO buyback rate: {pool.buybackrateText}</div>
              <div> Max entrance fee: {pool.entranceFeeText} </div>
              <div> Withdrawal fee: none </div>
          </div>
    </Grid>
    { pool.notes && pool.notes.length > 0 && (
      <Grid item sm={6} xs={12} md={3}>
        <div className="font-bold">Notes</div>
        {pool.notes && pool.notes.map(note => <div>{note}</div>)}
      </Grid>
    ) }

  </Grid>
)

export default memo(PoolInfo)
