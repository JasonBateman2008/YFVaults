import { memo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Tabs, Tab } from '@material-ui/core'
import { withStyles } from '@material-ui/core/styles'

// const degenWarning = (
//   <div className="dark:text-yellow-400 text-yellow-600 text-sm leading-tight mt-2">
//     <div style={{fontWeight:"bold", fontSize:"16px"}}> WARNING </div>
//     <div> These farms have NOT been reviewed by the autofarm&nbsp;team. </div>
//     <div> <b>DYOR</b>, use at your own risk.  </div>
//   </div>
// )

const AntTabs = withStyles({
  root: {
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  indicator: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#fff',
  },
})(Tabs);

const AntTab = withStyles((theme) => ({
  root: {
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'none',
    minWidth: 72,
    fontWeight: theme.typography.fontWeightRegular,
    marginRight: theme.spacing(4),
    '&:hover': {
      color: '#fff',
      opacity: 1,
    },
    '&$selected': {
      color: '#fff',
      fontWeight: theme.typography.fontWeightMedium,
    },
    '&:focus': {
      color: '#fff',
    },
  },
  selected: {},
}))((props) => <Tab disableRipple {...props} />);

const ToolBar = ({
  degen,
  hasDegen,
  toggleDegen,
  farmChoices = [],
  setSelectedFarm,
  selectedFarm,
  hideEmpty,
  setHideEmpty
}) => {
  const { pathname } = useLocation();

  return (
    <div className="py-2 space-y-2 mb-2">
      <div className="font-semibold text-base text-white leading-none mb-2">FARM POOLS</div>
      <AntTabs
        value={pathname}
        indicatorColor="primary"
        textColor="primary"
      >
        <AntTab
          label="Farm"
          value="/"
          component={ Link }
          to="/"
        />
        <AntTab
          label="LP"
          value="/lp"
          component={ Link }
          to="/lp"
        />
      </AntTabs>
    </div>
  )
}

export default memo(ToolBar);
