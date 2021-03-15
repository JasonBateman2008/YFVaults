import { memo } from 'react'
import { currency } from './lib/numFormat'

import {
  Grid, Avatar, Typography,
  Card, CardHeader, CardContent,
} from '@material-ui/core'
import { makeStyles, createMuiTheme, ThemeProvider } from '@material-ui/core/styles';
import { Lock, Person } from '@material-ui/icons'

const theme = createMuiTheme({
  overrides: {
    MuiCardHeader: {
      avatar: {
        marginRight: 8
      }
    },
    MuiAvatar: {
      root: {
        width: 30,
        height: 30,
      },
      colorDefault: {
        color: '#000',
        backgroundColor: '#fff',
      }
    },
    MuiTypography: {
      h2: {
        fontSize: '1.744rem',
        lineHeight: 1.2,
        '@media (min-width:600px)': {
          fontSize: '2.0833rem'
        },
        '@media (min-width:960px)': {
          fontSize: '2.2917rem'
        },
        '@media (min-width:1280px)': {
          fontSize: '2.5rem'
        }
      }
    }
  }
})

const useStyles = makeStyles({
  root: {
    background: 'linear-gradient(180deg, #2A2837 0%, #212229 100%)',
    borderRadius: 16,
    boxShadow: 'rgb(0 0 0 / 50%) 8px 16px 20px 0px',
    color: 'white',
  },
  content: {
    paddingTop: 0,
    paddingBottom: 12,
    paddingLeft: 24,
    '&:last-child': {
      paddingBottom: 16,
    }
  }
});

const Dashboard = ({
  platformTVL,
  tvls = {},
  priceAUTO,
  totalPendingAUTO,
  totalStaked,
  harvestAll,
  chain,
  numHarvestable = 0,
  showBuyAuto = true
}) => {
  const classes = useStyles();

  return (
    <ThemeProvider theme={theme}>
      <div className="my-6 text-left">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={7}>
            <Card className={classes.root}>
              <CardHeader
                avatar={
                  <Avatar>
                    <Lock />
                  </Avatar>
                }
                title={
                  <Typography variant="body1">Total Value Locked</Typography>
                }
              />
              <CardContent className={classes.content}>
                <Typography variant="h2" component="h2">
                  {currency(platformTVL, 0)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={5}>
            <Card className={classes.root}>
              <CardHeader
                avatar={
                  <Avatar>
                    <Person />
                  </Avatar>
                }
                title={
                  <Typography variant="body1">Total Deposit</Typography>
                }
              />
              <CardContent className={classes.content}>
                <Typography variant="h2" component="h2">
                  {currency(totalStaked)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </div>
    </ThemeProvider>
  )
}

export default memo(Dashboard)
