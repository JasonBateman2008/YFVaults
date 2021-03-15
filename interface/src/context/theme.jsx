import React from 'react'

export function isStoreDarkMode() {
  return false;
  // return localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

export function setDocTheme(darkMode) {
  if (darkMode) {
    document.documentElement.classList.add('dark')
    localStorage.theme = 'dark'
  } else {
    document.documentElement.classList.remove('dark')
    localStorage.setItem('theme', 'light')
  }
}

const ThemeContext = React.createContext({
  theme: 'light',
  toggleTheme: () => {}
})

export default ThemeContext
