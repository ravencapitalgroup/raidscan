import ManageCoins from './pages/ManageCoins';
import Scanner from './pages/Scanner';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ManageCoins": ManageCoins,
    "Scanner": Scanner,
}

export const pagesConfig = {
    mainPage: "Scanner",
    Pages: PAGES,
    Layout: __Layout,
};