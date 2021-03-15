import React, { memo } from 'react';
import constants from './constants'
import { Grid } from '@material-ui/core'

const BotNavBar = ({ chain = 'bsc' }) => {
  const links = [
    [
      ["https://beta.autofarm.network/audit_vidar_autofarm_v2.pdf", 'Audit'],
      ["https://github.com/autofarm-network/autofarmV2", 'Github'],
      [constants.blockExplorerURLBase[chain] + "address/" + constants.autoFarmV2ContractAddress.bsc, 'Contract'],
      ["https://autofarm-network.gitbook.io/autofarm-network/", 'Wiki'],
    ], [
      ["https://t.me/autofarm_network",  'Telegram'],
      ["https://autofarm-network.medium.com/",  'Medium'],
      ["https://twitter.com/autofarmnetwork",  'Twitter'],
      ["https://discord.gg/bJ9ZsypQzv",  'Discord'],
    ]
  ]
  return (
    <div className="bg-black-60 text-white absolute bottom-0 left-0 right-0">
      <div className="max-w-3xl m-auto px-3 pt-5 pb-7">
        { links.map((line, i) => (
          <Grid container key={i} spacing={2}>
            {line.map(([url, label]) => (
              <Grid item xs={3} className="text-center" key={url}>
                <a href={url} target="_blank" rel="noreferrer">{label}</a>
              </Grid>
            ))}
          </Grid>
        )) }
      </div>
    </div>
  )
}

export default memo(BotNavBar)

