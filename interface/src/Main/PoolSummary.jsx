import { memo, useMemo, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation } from 'react-query'
import { makeStyles, createMuiTheme, ThemeProvider } from '@material-ui/core/styles'
import { token, currency } from './lib/numFormat'

import {
  Button, Typography,
  Avatar, Grid,
  Card, CardHeader, CardActions,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, InputAdornment
} from '@material-ui/core'
import IconButton from '@material-ui/core/IconButton'
import AddIcon from '@material-ui/icons/Add'

import classnames from 'classnames'

const theme = createMuiTheme({
  overrides: {
    MuiBackdrop: {
      root: {
        backgroundColor: 'rgba(37,39,41, 0.95)'
      }
    },
    MuiDialog: {
      paper: {
        margin: 0,
        background: 'linear-gradient(180deg, #2A2837 0%, #212229 100%)',
        borderRadius: 16,
        boxShadow: 'rgb(0 0 0 / 50%) 8px 16px 20px 0px',
        color: 'white',
      }
    },
    MuiDialogContent: {
      root: {
        '&:first-child': {
          paddingTop: '.5rem',
        }
      }
    },
    MuiInputBase: {
      root: {
        paddingTop: '.25rem',
        paddingBottom: '.25rem',
      },
      input: {
        boxSizing: 'content-box !important',
        color: '#fff'
      }
    },
    MuiDialogActions: {
      root: {
        padding: '1rem 1.5rem'
      }
    },
    MuiInput: {
      underline: {
        '&:before': {
          borderBottomColor: 'rgba(255, 255, 255, 0.08)'
        },
        '&:after': {
          borderBottomWidth: 1
        },
        '&:hover:not(.Mui-disabled):before': {
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255, 255, 255, 0.08)'
        }
      }
    }
  }
})

const useStyles = makeStyles(theme => ({
  container: {
    paddingLeft: theme.spacing(7),
    paddingRight: theme.spacing(7),
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    background: 'linear-gradient(180deg, #2A2837 0%, #212229 100%)',
    borderRadius: 16,
    boxShadow: 'rgb(0 0 0 / 50%) 8px 16px 20px 0px',
    color: 'white',
    height: '100%',
    padding: '.5rem',
  },
  title: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  header: {
    display: 'block',
    textAlign: 'center',
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1),
  },
  cover: {
    marginLeft: 'auto',
    marginRight: 'auto',
    background: 'linear-gradient(90deg, #4571F6 0%, #8F5EE1 100%)',
  },
  avatar: {
    marginRight: 0,
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
  },
  button: {
    flex: '1 1 auto',
    color: '#fff',
    borderRadius: 18,
    background: 'linear-gradient(90deg, #4571F6 0%, #8F5EE1 100%)',
    border: 0,
    '&:hover': {
      background: 'linear-gradient(90deg, #4571F6 0%, #8F5EE1 80%)',
    }
  },
  btn: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    color: '#fff',
    borderRadius: 18,
    background: 'linear-gradient(90deg, #4571F6 0%, #8F5EE1 100%)',
    border: 0,
    '&:hover': {
      background: 'linear-gradient(90deg, #4571F6 0%, #8F5EE1 80%)',
    }
  },
  max: {
    background: 'linear-gradient(90deg, #4571F6 0%, #8F5EE1 100%)',
    borderRadius: '1.25rem',
    padding: '0.0625rem',

    '& > .MuiButton-label': {
      background: 'linear-gradient(180deg, #2A2837 0%, #212229 100%)',
      borderRadius: '1.25rem',
      color: '#fff',
    }
  },
  iconBtn: {
    padding: theme.spacing(.625)
  },
  actions: {
    marginTop: theme.spacing(3.5),
  },
  form: {
    minWidth: '31rem'
  },
  color1: {
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.38)'
  },
  color2: {
    color: 'rgba(255, 205, 69, 1)'
  }
}))

const PoolSummary = ({
  pools,
  farms,
  userData,

  withdraw,
  withdrawAll,
  deposit,
  approve,
}) => {
  const classes = useStyles()
  const { pid } = useParams()

  const [ depositFormOpen, setDepositFormOpen ] = useState(false)
  const [ withdrawFormOpen, setWithdrawFormOpen ] = useState(false)

  const [ depositAmt, setDepositAmt ] = useState('')
  const [ withdrawAmt, setWithdrawAmt ] = useState('')

  const handleDepositFormClose = useCallback(() => setDepositFormOpen(false), [])
  const handleWithdrawFormClose = useCallback(() => setWithdrawFormOpen(false), [])

  const summary = useMemo(() => pools.find(([ id ]) => id === Number(pid)), [ pid, pools ])
  const pool    = useMemo(() => farms?.[pid], [ pid, farms ])

  const allowances      = useMemo(() => userData?.allowances?.[pid], [ pid, userData ])
  const pendingAUTO     = useMemo(() => userData?.pendingAUTO?.[pid], [ pid, userData ])
  const wantsBalance    = useMemo(() => userData?.balances?.[pid], [ pid, userData ])
  const stakedWantToken = useMemo(() => userData?.staked?.[pid], [ pid, userData ])

  const depositMutation = useMutation(deposit)
  const withdrawMutation = useMutation(withdraw)
  const withdrawAllMutation = useMutation(withdrawAll)
  const harvestMutation = useMutation(withdraw)
  const approveMutation = useMutation(approve)

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

  const handleWithdrawAll = useCallback(() => {
    withdrawAllMutation.mutate({ pid })
  }, [pid, withdrawAllMutation])

  const handleHarvest = useCallback(() => {
    harvestMutation.mutate({ pid, amt: '0' })
  }, [pid, harvestMutation])

  const handleApprove = useCallback(() => {
    approveMutation.mutate({ pid })
  }, [pid, approveMutation])

  const isPending = useMemo(() => {
    return harvestMutation.isLoading
            || depositMutation.isLoading
            || withdrawMutation.isLoading
            || withdrawAllMutation.isLoading

  }, [ harvestMutation, withdrawMutation, withdrawAllMutation, depositMutation ])

  const [ ,, asset ] = summary

  return (
    <>
      <Typography variant="h5" className={classes.title}>
        DEPOSIT { asset } HARVEST HT + EDC
      </Typography>

      <Grid container spacing={2} className={classes.container}>
        <Grid item xs={12} md={6}>
          <Card className={classes.root}>
            <CardHeader
              classes={{
                root: classes.header,
                avatar: classes.avatar,
              }}
              avatar={
                <Avatar className={classes.cover}></Avatar>
              }
              title={
                <Typography variant="h5">{token(pendingAUTO)}</Typography>
              }
              subheader={
                <Typography variant="body2" className="text-gray-500">YF 待收获</Typography>
              }
            />
            <CardHeader
              className={classes.header}
              title={
                <Typography variant="h5">0.000000</Typography>
              }
              subheader={
                <Typography variant="body2" className="text-gray-500">USDT 待收获</Typography>
              }
            />
            <CardActions className={classes.actions}>
              <Button
                className={classes.button}
                fullWidth
                disabled={ !pendingAUTO || parseFloat(pendingAUTO) === 0 || isPending }
                onClick={handleHarvest}
              >
                { harvestMutation.isLoading ? 'Harvesting...' : 'Harvest' }
              </Button>
            </CardActions>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card className={classes.root}>
            <CardHeader
              classes={{
                root: classes.header,
                avatar: classes.avatar,
              }}
              avatar={
                <Avatar className={classes.cover}></Avatar>
              }
              title={
                <Typography variant="h5">0.000000</Typography>
              }
              subheader={
                <Typography variant="body2" className="text-gray-500">YF 待收获</Typography>
              }
            />
            <CardActions className={classes.actions}>
              { allowances > 0 ?
                <>
                  <Button
                    className={classes.button}
                    disabled={ parseFloat(stakedWantToken) === 0 || isPending }
                    onClick={() => setWithdrawFormOpen(true)}
                  >
                    取本金
                  </Button>
                  <Button
                    className={classes.button}
                    disabled={ parseFloat(stakedWantToken) === 0 || isPending }
                    onClick={handleWithdrawAll}
                  >
                    全部退出
                  </Button>
                  <IconButton
                    color="primary"
                    className={classes.iconBtn}
                    disabled={ isPending }
                    onClick={() => setDepositFormOpen(true)}
                  >
                    <AddIcon />
                  </IconButton>
                </> :
                <Button
                  className={classes.button}
                  fullWidth
                  disabled={ approveMutation.isLoading }
                  onClick={handleApprove}
                >
                  { approveMutation.isLoading ? 'Approving...' : 'Approve' } {asset}
                </Button>
              }
            </CardActions>
          </Card>
        </Grid>
      </Grid>

      <ThemeProvider theme={theme}>
        <Dialog open={depositFormOpen} onClose={handleDepositFormClose} maxWidth="xs" fullWidth>
          <DialogTitle>DEPOSIT TOKENS</DialogTitle>
          <form onSubmit={handleDeposit}>
            <DialogContent>
              <TextField
                placeholder="0"
                min="0"
                step="any"
                inputMode="decimal"
                onChange={e => setDepositAmt(e.target.value)}
                value={depositAmt}
                disabled={withdrawMutation.isLoading}
                helperText={
                  <span className="flex justify-between flex-auto">
                    <span className={classnames('font-semibold', classes.color1)}>Balance</span>
                    <span onClick={() => setDepositAmt(wantsBalance)} className={classnames('cursor-pointer', classes.color2)}>
                      {token(wantsBalance)} ({currency(wantsBalance * pool.wantPrice) })
                    </span>
                  </span>
                }
                fullWidth
                InputLabelProps={{
                  shrink: true,
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button className={classes.max} onClick={() => setDepositAmt(wantsBalance)}>
                        MAX
                      </Button>
                    </InputAdornment>
                  )
                }}
              />
            </DialogContent>
            <DialogActions>
              <Button type="submit" className={classes.btn} disabled={depositAmt <= 0 || depositMutation.isLoading}>
                { depositMutation.isLoading ? 'Depositing...' : `Deposit` }
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        <Dialog open={withdrawFormOpen} onClose={handleWithdrawFormClose} maxWidth="xs" fullWidth>
          <DialogTitle>WITHDRAW TOKENS</DialogTitle>
          <form onSubmit={handleWithdraw}>
            <DialogContent>
              <TextField
                placeholder="0"
                min="0"
                step="any"
                inputMode="decimal"
                onChange={e => setWithdrawAmt(e.target.value)}
                value={withdrawAmt}
                disabled={withdrawMutation.isLoading}
                helperText={
                  <span className="flex justify-between flex-auto">
                    <span className={classnames('font-semibold', classes.color1)}>Deposit</span>
                    <span onClick={() => setWithdrawAmt(stakedWantToken)} className={classnames('cursor-pointer', classes.color2)}>
                      {token(stakedWantToken)} ({currency(stakedWantToken * pool.wantPrice) })
                    </span>
                  </span>
                }
                fullWidth
                InputLabelProps={{
                  shrink: true,
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button className={classes.max} onClick={() => setWithdrawAmt(stakedWantToken)}>
                        MAX
                      </Button>
                    </InputAdornment>
                  )
                }}
              />
            </DialogContent>
            <DialogActions>
              <Button type="submit" className={classes.btn} disabled={withdrawAmt <= 0 || withdrawMutation.isLoading}>
                { withdrawMutation.isLoading ? 'Withdrawing...' : `Withdraw` }
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      </ThemeProvider>
    </>
  )
}

export default memo(PoolSummary)
