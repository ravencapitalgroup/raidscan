import CoinData from './pages/CoinData';
import ManageCoins from './pages/ManageCoins';
import Scanner from './pages/Scanner';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CoinData": CoinData,
    "ManageCoins": ManageCoins,
    "Scanner": Scanner,
}

export const pagesConfig = {
    mainPage: "Scanner",
    Pages: PAGES,
    Layout: __Layout,
};