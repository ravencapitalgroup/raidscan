import Scanner from './pages/Scanner';
import ManageCoins from './pages/ManageCoins';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Scanner": Scanner,
    "ManageCoins": ManageCoins,
}

export const pagesConfig = {
    mainPage: "Scanner",
    Pages: PAGES,
    Layout: __Layout,
};