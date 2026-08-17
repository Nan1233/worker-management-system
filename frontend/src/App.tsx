import DesktopExcelDbSyncNotifier from "./components/DesktopExcelDbSyncNotifier";
import AppRouter from "./routes/AppRouter";
import NetworkStatusBanner from "./components/system/NetworkStatusBanner";

function App() {
    return <>
        <DesktopExcelDbSyncNotifier />
        <NetworkStatusBanner />
        <AppRouter />
    </>;
}

export default App;